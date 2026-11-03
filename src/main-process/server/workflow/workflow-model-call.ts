import {
  APICallError,
  generateText,
  jsonSchema,
  Output,
  RetryError,
  streamText,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";

import { mergeSameRoleTurns } from "@shared/chat/model-message-turns";
import { getModelCapabilities } from "@shared/models/model-details";
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
import type {
  WorkflowDecisionCall,
  WorkflowDecisionResult,
  WorkflowModelCall,
  WorkflowModelResult,
} from "./run-workflow";

const MAX_LIMIT_RETRIES = 8;
const BASE_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

interface ResolvedStepModel {
  model: ModelTableRow;
  providerId: ProviderId;
  languageModel: Awaited<ReturnType<typeof createLanguageModel>>;
  reasoningEffort: WorkflowModelRef["reasoningEffort"];
  temperature: number | undefined;
  /** Whether a Decision can ask this model for JSON that follows a schema. */
  structured: "yes" | "no" | "unknown";
  /** A model that can take a temperature; Decisions ask with 0. */
  acceptsTemperature: boolean;
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

  const callModel = async (call: WorkflowModelCall): Promise<WorkflowModelResult> => {
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
    return toModelResult(step, metadata);
  };

  // Models whose schema-following answers failed once in this run.
  const noStructured = new Set<string>();

  /**
   * A Decision's yes or no. Models that can follow a JSON schema (OpenRouter's
   * `structured_outputs`/`response_format`, or not stated) are asked for
   * `{ reason, answer }`; OpenRouter is told to route only to endpoints that
   * honor it. If that fails for any reason but a provider limit or a stop,
   * and for models that can't, the model is asked to reply YES or NO.
   */
  const decide = async (call: WorkflowDecisionCall): Promise<WorkflowDecisionResult> => {
    const step = await resolve(call.model);
    const startedAt = Date.now();
    const temperature = step.acceptsTemperature ? 0 : undefined;
    const base = {
      model: step.languageModel,
      system: call.system,
      temperature,
      reasoning: step.reasoningEffort ?? undefined,
      // OpenRouter routes only to endpoints that honor the schema (and temperature).
      providerOptions: buildChatProviderOptions(
        step.providerId,
        step.reasoningEffort ?? undefined,
        temperature,
        step.model.providerModelId,
      ),
      maxRetries: 0,
      abortSignal: call.signal,
    };
    let usage: LanguageModelUsage | undefined;

    if (step.structured !== "no" && !noStructured.has(step.model.id)) {
      try {
        const result = await generateText({
          ...base,
          messages: withInstruction(call.messages, STRUCTURED_INSTRUCTION),
          output: Output.object({
            schema: DECISION_SCHEMA,
            name: "decision",
            description: "The answer to the question, yes (true) or no (false).",
          }),
        });
        return {
          ...toModelResult(
            step,
            buildResponseMetadata(
              result.totalUsage,
              step.providerId,
              step.model,
              Date.now() - startedAt,
            ),
          ),
          answer: result.output.answer,
          ...(result.output.reason.trim() ? { reason: result.output.reason.trim() } : {}),
          method: "structured",
        };
      } catch (error) {
        if (call.signal.aborted || getWorkflowRetryDelay(error, 1) !== null) throw error;
        console.warn(
          "[workflow] Structured decision failed; asking for a plain yes or no.",
          { modelId: step.model.id },
          error instanceof Error ? error.message : error,
        );
        noStructured.add(step.model.id);
        usage = getErrorUsage(error);
      }
    }

    const result = await generateText({
      ...base,
      providerOptions: buildChatProviderOptions(
        step.providerId,
        step.reasoningEffort ?? undefined,
        undefined,
        step.model.providerModelId,
      ),
      messages: withInstruction(call.messages, TEXT_INSTRUCTION),
    });
    const parsed = parseTextDecision(result.text);
    if (!parsed) {
      throw new Error(
        `The model's answer wasn't yes or no: “${result.text.trim().slice(0, 120) || "nothing"}”`,
      );
    }
    return {
      ...toModelResult(
        step,
        buildResponseMetadata(
          addUsage(usage, result.totalUsage),
          step.providerId,
          step.model,
          Date.now() - startedAt,
        ),
      ),
      ...parsed,
      method: "text",
    };
  };

  return { callModel, decide };
}

const STRUCTURED_INSTRUCTION =
  "Answer the question above with yes or no. Reply with JSON only: `reason`, one short sentence on why, then `answer`, true for yes and false for no.";
const TEXT_INSTRUCTION =
  "Answer the question above with yes or no. Reply with YES or NO on the first line, then one short sentence on why.";

interface DecisionAnswer {
  reason: string;
  answer: boolean;
}

const DECISION_SCHEMA = jsonSchema<DecisionAnswer>(
  {
    type: "object",
    properties: {
      reason: { type: "string", description: "One short sentence on why." },
      answer: { type: "boolean", description: "true for yes, false for no." },
    },
    required: ["reason", "answer"],
    additionalProperties: false,
  },
  {
    validate: (value) => {
      const record = value as Partial<DecisionAnswer> | null;
      if (record && typeof record === "object" && typeof record.answer === "boolean") {
        return {
          success: true,
          value: {
            answer: record.answer,
            reason: typeof record.reason === "string" ? record.reason : "",
          },
        };
      }
      return { success: false, error: new Error("The answer has no true or false `answer`.") };
    },
  },
);

/** The request with how to answer added to its last user turn. */
function withInstruction(messages: readonly ModelMessage[], instruction: string): ModelMessage[] {
  return mergeSameRoleTurns([...messages, { role: "user", content: instruction }]);
}

/**
 * Reads YES/NO (or true/false) from a plain reply: the first such word, after
 * any thinking the model wrote out; the rest of its first lines is the reason.
 */
export function parseTextDecision(text: string): { answer: boolean; reason?: string } | null {
  const visible = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
  const match = /\b(yes|no|true|false)\b/i.exec(visible);
  if (!match) return null;
  const answer = /^(yes|true)$/i.test(match[1]!);
  const reason = visible
    .slice(match.index + match[0].length)
    .replace(/^[\s.:,*\-–—]+/, "")
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  return reason ? { answer, reason: reason.slice(0, 400) } : { answer };
}

function toModelResult(
  step: ResolvedStepModel,
  metadata: ReturnType<typeof buildResponseMetadata>,
): WorkflowModelResult {
  return {
    modelId: step.model.id,
    ...(metadata.tokens
      ? { tokens: { input: metadata.tokens.input, output: metadata.tokens.output } }
      : {}),
    ...(metadata.cost
      ? { cost: { total: metadata.cost.total, currency: metadata.cost.currency } }
      : {}),
  };
}

function getErrorUsage(error: unknown): LanguageModelUsage | undefined {
  if (error && typeof error === "object" && "usage" in error) {
    // SAFETY: AI SDK errors that carry usage (NoObjectGeneratedError) carry a LanguageModelUsage.
    return (error as { usage?: LanguageModelUsage }).usage;
  }
  return undefined;
}

function addUsage(
  first: LanguageModelUsage | undefined,
  second: LanguageModelUsage,
): LanguageModelUsage {
  if (!first) return second;
  const add = (a: number | undefined, b: number | undefined) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  return {
    ...second,
    inputTokens: add(first.inputTokens, second.inputTokens),
    outputTokens: add(first.outputTokens, second.outputTokens),
    totalTokens: add(first.totalTokens, second.totalTokens),
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
  const metadata = model.metadata;
  // Only a provider that lists what a model accepts can say it doesn't take a schema.
  const listsParameters = Array.isArray(metadata?.["supported_parameters"]);
  const structured = getModelCapabilities(metadata).includes("structured")
    ? "yes"
    : listsParameters
      ? "no"
      : "unknown";
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
    structured,
    acceptsTemperature: temperatureMax !== null,
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
