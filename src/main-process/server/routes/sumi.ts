import { Hono } from "hono";
import { generateText, smoothStream, streamText } from "ai";
import { parseChatId } from "@shared/chat/chat-id";
import {
  GRAMMAR_FIX_MAX_CHARS,
  type GrammarFixRequest,
  type GrammarFixSegments,
} from "@shared/sumi/grammar-fix";
import { getModelById } from "../../models/repository";
import { readSumiSettings } from "../../services/settings-service";
import {
  SUMI_FEATURES,
  SUMI_GRAMMAR_FIX_INSTRUCTIONS,
  isSumiFeatureId,
} from "../assistant/features";
import { GrammarFixRejectedError, fixGrammarSegments } from "../assistant/grammar-fix";
import {
  createSumiLanguageModel,
  resolveConfiguredSumiModel,
  sumiModelAcceptsTemperature,
  type ResolvedSumiModel,
} from "../assistant/sumi-model";
import { generateSumiItemTitle } from "../assistant/title-generation";

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

  app.post("/api/sumi/grammar", async (c) => {
    const body = await c.req.json().catch(() => null);
    const request = body as Partial<GrammarFixRequest> | null;
    const segments = request?.segments;
    if (
      !Array.isArray(segments) ||
      segments.length === 0 ||
      !segments.every((segment) => typeof segment === "string")
    ) {
      return c.text("segments must be a non-empty array of strings.", 400);
    }
    if (segments.reduce((total, segment) => total + segment.length, 0) > GRAMMAR_FIX_MAX_CHARS) {
      return c.text("This text is too long to fix at once. Select a smaller part of it.", 413);
    }

    const settings = readSumiSettings();
    if (!settings.promptActions.enabled) {
      return c.text("This Sumi feature is disabled.", 403);
    }

    const modelTarget = resolveConfiguredSumiModel(settings.promptActions.model);
    const languageModel = modelTarget ? await createSumiLanguageModel(modelTarget) : null;
    if (!modelTarget || !languageModel) {
      return c.text("The configured Sumi model is unavailable.", 400);
    }

    const temperature = sumiModelAcceptsTemperature(modelTarget) ? 0 : undefined;
    const maxOutputTokens = Math.max(1024, segments.join("").length * 2);

    try {
      const corrected = await fixGrammarSegments(
        segments,
        (prompt) =>
          generateText({
            abortSignal: c.req.raw.signal,
            model: languageModel,
            instructions: SUMI_GRAMMAR_FIX_INSTRUCTIONS,
            prompt,
            temperature,
            maxOutputTokens,
          }),
        request?.startsMidSentence === true,
      );
      return c.json({ segments: corrected } satisfies GrammarFixSegments);
    } catch (error) {
      if (error instanceof GrammarFixRejectedError) {
        return c.text(error.message, 422);
      }
      const message = error instanceof Error ? error.message : "Sumi could not fix this text.";
      return c.text(message, 502);
    }
  });

  app.post("/api/sumi/title", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.text("Request body must be an object.", 400);
    }

    const input = body as Record<string, unknown>;
    const parsedItemId = parseChatId(input.itemId);
    if (!parsedItemId.ok) {
      return c.text(parsedItemId.error.replace("Chat", "Item"), 400);
    }
    if (
      input.sourcePrompt !== undefined &&
      (typeof input.sourcePrompt !== "string" || input.sourcePrompt.trim().length === 0)
    ) {
      return c.text("sourcePrompt must be a non-empty string.", 400);
    }
    if (input.mode !== undefined && input.mode !== "auto" && input.mode !== "explicit") {
      return c.text("mode must be auto or explicit.", 400);
    }

    try {
      const event = await generateSumiItemTitle({
        itemId: parsedItemId.value,
        sourcePrompt: typeof input.sourcePrompt === "string" ? input.sourcePrompt : null,
        mode: input.mode === "auto" ? "auto" : "explicit",
      });
      if (!event) return c.body(null, 204);
      return c.json(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sumi could not generate a title.";
      return c.text(message, 400);
    }
  });

  return app;
}

function resolveSumiModel(
  overrideModelId: unknown,
  configuredModel: Parameters<typeof resolveConfiguredSumiModel>[0],
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

  return resolveConfiguredSumiModel(configuredModel);
}
