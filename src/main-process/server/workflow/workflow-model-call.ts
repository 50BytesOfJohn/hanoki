import { APICallError, RetryError, streamText, type LanguageModelUsage } from "ai";

import { getModelReasoningEfforts } from "@shared/models/reasoning";
import { getModelTemperatureMax } from "@shared/models/temperature";
import type { ProviderId } from "@shared/providers/catalog";
import type { WorkflowModelRef } from "@shared/workflow/graph";
import { getWorkflowModelUnavailableReason } from "@shared/workflow/model-availability";

import { getModelById, type ModelTableRow } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { buildChatProviderOptions } from "../providers/chat-provider-options";
import { createLanguageModel } from "../providers/language-model-factory";
import { buildResponseMetadata } from "../providers/metadata-extractor";
import { getChatStreamErrorMessage } from "../chat-stream-error";
import type { WorkflowModelCall, WorkflowModelResult } from "./run-workflow";

const MAX_LIMIT_RETRIES = 8;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

interface ResolvedStepModel {
  model: ModelTableRow;
  providerId: ProviderId;
  languageModel: Awaited<ReturnType<typeof createLanguageModel>>;
  reasoningEffort: WorkflowModelRef["reasoningEffort"];
  temperature: number | undefined;
}

/**
 * Model calls for one run. Each model is resolved once and shared by every
 * step that uses it. Temperature is the chat's, applied only to models that
 * accept a custom one.
 */
export function createWorkflowModelCaller(temperature: number | undefined) {
  const resolved = new Map<string, Promise<ResolvedStepModel>>();

  const resolve = (ref: WorkflowModelRef) => {
    const key = `${ref.modelId}:${ref.reasoningEffort ?? ""}`;
    let entry = resolved.get(key);
    if (!entry) {
      entry = resolveStepModel(ref, temperature);
      resolved.set(key, entry);
      // A failed lookup (e.g. a model disabled mid-run) should not stick.
      entry.catch(() => resolved.delete(key));
    }
    return entry;
  };

  return async (call: WorkflowModelCall): Promise<WorkflowModelResult> => {
    const step = await resolve(call.model);
    const startedAt = Date.now();
    const result = streamText({
      model: step.languageModel,
      system: call.system,
      messages: call.messages,
      temperature: step.temperature,
      reasoning: step.reasoningEffort ?? undefined,
      providerOptions: buildChatProviderOptions(
        step.providerId,
        step.reasoningEffort ?? undefined,
        step.temperature,
        step.model.providerModelId,
      ),
      // Provider limits are retried by the runner, which can show the wait.
      maxRetries: 0,
      abortSignal: call.signal,
    });

    let usage: LanguageModelUsage | undefined;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") call.onText(part.text);
      else if (part.type === "finish") usage = part.totalUsage;
      else if (part.type === "error") throw part.error;
      else if (part.type === "abort") throw new DOMException("Stopped", "AbortError");
    }

    const metadata = buildResponseMetadata(
      usage,
      step.providerId,
      step.model,
      Date.now() - startedAt,
    );
    return {
      modelId: step.model.id,
      ...(metadata.tokens
        ? { tokens: { input: metadata.tokens.input, output: metadata.tokens.output } }
        : {}),
      ...(metadata.cost
        ? { cost: { total: metadata.cost.total, currency: metadata.cost.currency } }
        : {}),
    };
  };
}

async function resolveStepModel(
  ref: WorkflowModelRef,
  chatTemperature: number | undefined,
): Promise<ResolvedStepModel> {
  const model = getModelById(ref.modelId);
  const provider = model ? getProviderById(model.providerId) : null;
  // Checked before the run starts too; this covers a model turned off mid-run.
  const unavailable = getWorkflowModelUnavailableReason(
    model && { isEnabled: model.isEnabled, status: model.lifecycleStatus, hasProvider: !!provider },
  );
  if (!model || !provider || unavailable) {
    throw new Error(
      unavailable === "disabled"
        ? "This step's model is turned off. Pick another model for it."
        : "This step's model was removed. Pick another model for it.",
    );
  }

  // SAFETY: provider rows are only created from catalog ids (see the chat route).
  const providerId = provider.catalogId as ProviderId;
  const languageModel = await createLanguageModel({
    providerRow: provider,
    providerRuntime: await resolveProviderRuntimeContext(provider),
    providerModelId: model.providerModelId,
  });
  const offered = getModelReasoningEfforts(providerId, model.metadata);
  const temperatureMax = getModelTemperatureMax(providerId, model.metadata);
  return {
    model,
    providerId,
    languageModel,
    reasoningEffort:
      ref.reasoningEffort && offered.includes(ref.reasoningEffort) ? ref.reasoningEffort : null,
    temperature:
      temperatureMax !== null && chatTemperature !== undefined && chatTemperature <= temperatureMax
        ? chatTemperature
        : undefined,
  };
}

/**
 * Provider limits (too many requests, too many at once, overloaded) are waited
 * out with exponential backoff, honoring `Retry-After`. Anything else fails
 * the step straight away.
 */
export function getWorkflowRetryDelay(error: unknown, attempt: number): number | null {
  if (attempt > MAX_LIMIT_RETRIES) return null;
  const apiError = findApiCallError(error);
  const status = apiError?.statusCode;
  const message = (
    apiError?.message ?? (error instanceof Error ? error.message : "")
  ).toLowerCase();
  const isLimit =
    status === 429 ||
    status === 503 ||
    status === 529 ||
    /rate.?limit|too many (requests|concurrent)|concurren(t|cy) (request|limit)|overloaded/.test(
      message,
    );
  if (!isLimit) return null;

  const retryAfter = Number(apiError?.responseHeaders?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS * 2);
  }
  const backoff = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return Math.round(backoff * (0.8 + Math.random() * 0.4));
}

function findApiCallError(error: unknown): APICallError | null {
  if (APICallError.isInstance(error)) return error;
  if (RetryError.isInstance(error)) return findApiCallError(error.lastError);
  if (error instanceof Error && error.cause != null) return findApiCallError(error.cause);
  return null;
}

/** User-facing copy for a failed step, matching chat errors. */
export function getWorkflowStepErrorMessage(error: unknown): string {
  return getChatStreamErrorMessage(error);
}
