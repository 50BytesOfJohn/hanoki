import { Hono } from "hono";
import { smoothStream, streamText } from "ai";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { readSumiSettings } from "../../services/settings-service";
import { SUMI_FEATURES, isSumiFeatureId } from "../assistant/features";
import { createLanguageModel } from "../providers/language-model-factory";

interface ResolvedSumiModel {
  providerId: string;
  providerModelId: string;
}

export function createSumiRoute() {
  const app = new Hono();

  app.post("/api/sumi", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.text("Request body must be an object.", 400);
    }

    const input = body as Record<string, unknown>;
    if (!isSumiFeatureId(input.feature)) {
      return c.text("Unsupported Sumi feature.", 400);
    }
    if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) {
      return c.text("Prompt is required.", 400);
    }
    if (
      input.modelId !== undefined &&
      (typeof input.modelId !== "string" || input.modelId.trim().length === 0)
    ) {
      return c.text("modelId must be a non-empty string.", 400);
    }

    const settings = readSumiSettings();
    if (!settings.promptActions.enabled) {
      return c.text("This Sumi feature is disabled.", 403);
    }

    const modelTarget = resolveSumiModel(input.modelId, settings.promptActions.model);
    if (!modelTarget) {
      return c.text("The configured Sumi model is unavailable.", 400);
    }

    const provider = getProviderById(modelTarget.providerId);
    if (!provider) {
      return c.text("The configured Sumi provider is unavailable.", 400);
    }

    try {
      const providerRuntime = resolveProviderRuntimeContext(provider);
      const languageModel = createLanguageModel({
        providerRow: provider,
        providerRuntime,
        providerModelId: modelTarget.providerModelId,
      });
      const result = streamText({
        abortSignal: c.req.raw.signal,
        model: languageModel,
        experimental_transform: smoothStream({ chunking: "word" }),
        instructions: SUMI_FEATURES[input.feature].system,
        prompt: input.prompt,
      });

      return result.toTextStreamResponse();
    } catch {
      return c.text("The configured Sumi model could not be started.", 400);
    }
  });

  return app;
}

function resolveSumiModel(
  overrideModelId: unknown,
  configuredModel: ReturnType<typeof readSumiSettings>["promptActions"]["model"],
): ResolvedSumiModel | null {
  if (typeof overrideModelId === "string" && overrideModelId.trim().length > 0) {
    const model = getModelById(overrideModelId);
    if (!model || model.lifecycleStatus !== "active") {
      return null;
    }

    return {
      providerId: model.providerId,
      providerModelId: model.providerModelId,
    };
  }

  if (!configuredModel) {
    return null;
  }

  const storedModel = getModelById(
    `${configuredModel.providerId}:${configuredModel.providerModelId}`,
  );
  if (storedModel && storedModel.lifecycleStatus !== "active") {
    return null;
  }

  return {
    providerId: configuredModel.providerId,
    providerModelId: configuredModel.providerModelId,
  };
}
