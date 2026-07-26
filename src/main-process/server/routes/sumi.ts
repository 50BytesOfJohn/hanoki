import { Hono } from "hono";
import { smoothStream, streamText } from "ai";
import { parseChatId } from "@shared/chat/chat-id";
import type { ChatTitleUpdatedEvent } from "@shared/events";
import type { SumiModelReference } from "@shared/ipc";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { readSumiSettings } from "../../services/settings-service";
import { SUMI_FEATURES, isSumiFeatureId } from "../assistant/features";
import { generateSumiChatTitle } from "../assistant/title-generation";
import { createLanguageModel } from "../providers/language-model-factory";

interface ResolvedSumiModel {
  providerId: string;
  providerModelId: string;
}

interface CreateSumiRouteOptions {
  onChatTitleUpdated?: (event: Omit<ChatTitleUpdatedEvent, "type">) => void;
}

export function createSumiRoute(options?: CreateSumiRouteOptions) {
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

    const languageModel = await createSumiLanguageModel(modelTarget);
    if (!languageModel) {
      return c.text("The configured Sumi model could not be started.", 400);
    }

    const result = streamText({
      abortSignal: c.req.raw.signal,
      model: languageModel,
      experimental_transform: smoothStream({ chunking: "word" }),
      instructions: SUMI_FEATURES[input.feature].system,
      prompt: input.prompt,
    });

    return result.toTextStreamResponse();
  });

  app.post("/api/sumi/title", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.text("Request body must be an object.", 400);
    }

    const input = body as Record<string, unknown>;
    const parsedChatId = parseChatId(input.chatId);
    if (!parsedChatId.ok) {
      return c.text(parsedChatId.error, 400);
    }
    if (
      input.sourcePrompt !== undefined &&
      (typeof input.sourcePrompt !== "string" || input.sourcePrompt.trim().length === 0)
    ) {
      return c.text("sourcePrompt must be a non-empty string.", 400);
    }

    try {
      const event = await generateSumiChatTitle({
        chatId: parsedChatId.value,
        sourcePrompt: typeof input.sourcePrompt === "string" ? input.sourcePrompt : null,
      });
      options?.onChatTitleUpdated?.({
        chatId: event.chatId,
        workspaceId: event.workspaceId,
        title: event.title,
      });
      return c.json(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sumi could not generate a title.";
      return c.text(message, 400);
    }
  });

  return app;
}

async function createSumiLanguageModel(modelTarget: ResolvedSumiModel) {
  const provider = getProviderById(modelTarget.providerId);
  if (!provider) {
    return null;
  }

  try {
    const providerRuntime = resolveProviderRuntimeContext(provider);
    return await createLanguageModel({
      providerRow: provider,
      providerRuntime,
      providerModelId: modelTarget.providerModelId,
    });
  } catch {
    return null;
  }
}

function resolveSumiModel(
  overrideModelId: unknown,
  configuredModel: SumiModelReference | null,
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
