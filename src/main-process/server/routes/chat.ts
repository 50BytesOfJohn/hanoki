import { Hono } from "hono";
import { consumeStream, convertToModelMessages, isStepCount, smoothStream, streamText } from "ai";
import { parseChatId } from "@shared/chat/chat-id";
import type { ChatTitleUpdatedEvent } from "@shared/events";
import {
  normalizeChatMessageMetadata,
  type ChatMessageMetadata,
  type HanokiUiMessage,
} from "@shared/chat/message-metadata";
import { createUuidV7 } from "@shared/uuidv7";
import {
  getChatById,
  getChatCurrentBranchId,
  setChatCurrentBranch,
} from "../../chat-tree/repository";
import { getMessageById, listAllMessagesByChatId, upsertMessage } from "../../messages/repository";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { createLanguageModel } from "../providers/language-model-factory";
import { buildResponseMetadata } from "../providers/metadata-extractor";
import type { ProviderId } from "@shared/providers/catalog";
import { readSumiSettings } from "../../services/settings-service";
import { generateSumiChatTitle } from "../assistant/title-generation";
import { webTools } from "../assistant/web-tools";

const CONTINUATION_PROMPT =
  "Continue directly from where you left off. Do not repeat any previous content, do not add any introduction or summary. Just pick up exactly at the end of your last sentence.";

interface CreateChatRouteOptions {
  onChatTitleUpdated?: (event: Omit<ChatTitleUpdatedEvent, "type">) => void;
}

export function createChatRoute(options?: CreateChatRouteOptions) {
  const app = new Hono();

  app.post("/api/chat", async (c) => {
    const body = await c.req.json();
    const messages: HanokiUiMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const mode = body.mode === "continue-message" ? "continue-message" : "default";
    const modelId: string | undefined = body.modelId;
    const requestChatId = typeof body.chatId === "string" ? body.chatId : undefined;
    const targetMessageId =
      typeof body.targetMessageId === "string" ? body.targetMessageId : undefined;
    const parsedChatId = parseChatId(requestChatId);

    if (!modelId) {
      return c.json({ error: "modelId is required" }, 400);
    }

    if (!parsedChatId.ok) {
      return c.json({ error: "chatId is required" }, 400);
    }

    const chat = getChatById(parsedChatId.value);
    if (!chat) {
      return c.json({ error: "Chat not found" }, 400);
    }

    const model = getModelById(modelId);
    if (!model || !model.isEnabled) {
      return c.json({ error: "Model not found or not enabled" }, 400);
    }

    const provider = getProviderById(model.providerId);
    if (!provider) {
      return c.json({ error: "Model not found or not enabled" }, 400);
    }

    let languageModel: ReturnType<typeof createLanguageModel>;
    try {
      const providerRuntime = resolveProviderRuntimeContext(provider);
      languageModel = createLanguageModel({
        providerRow: provider,
        providerRuntime,
        providerModelId: model.providerModelId,
      });
    } catch {
      return c.json({ error: "Model not found or not enabled" }, 400);
    }

    const lastRequestMessage = messages.at(-1);
    let continuationTargetMessage: ReturnType<typeof getMessageById> = null;
    let responseParentId = lastRequestMessage?.id ?? null;

    if (mode === "continue-message") {
      if (!targetMessageId) {
        return c.json({ error: "targetMessageId is required" }, 400);
      }

      if (!lastRequestMessage || lastRequestMessage.id !== targetMessageId) {
        return c.json({ error: "Continuation target must be the last request message" }, 400);
      }

      if (lastRequestMessage.role !== "assistant") {
        return c.json({ error: "Continuation target must be an assistant message" }, 400);
      }

      continuationTargetMessage = getMessageById(targetMessageId);
      if (!continuationTargetMessage) {
        return c.json({ error: "Continuation target message not found" }, 400);
      }

      if (continuationTargetMessage.chatId !== chat.id) {
        return c.json({ error: "Continuation target message does not belong to this chat" }, 400);
      }

      if (continuationTargetMessage.role !== "assistant") {
        return c.json({ error: "Continuation target must be an assistant message" }, 400);
      }

      responseParentId = continuationTargetMessage.parentId;
    }

    const shouldAutoGenerateTitle =
      mode !== "continue-message" &&
      lastRequestMessage?.role === "user" &&
      !listAllMessagesByChatId(chat.id).some((message) => message.role === "user");

    if (mode !== "continue-message" && lastRequestMessage?.role === "user") {
      const parentId = lastRequestMessage.metadata?.parentId ?? null;

      upsertMessage({
        id: lastRequestMessage.id,
        chatId: chat.id,
        parentId,
        role: "user",
        parts: lastRequestMessage.parts,
        metadata: { parentId },
      });

      const titleGeneration = readSumiSettings().titleGeneration;
      if (shouldAutoGenerateTitle && titleGeneration.enabled && titleGeneration.autoGenerate) {
        void generateSumiChatTitle({
          chatId: chat.id,
          sourcePrompt: extractUiMessageText(lastRequestMessage),
        })
          .then((event) => {
            options?.onChatTitleUpdated?.({
              chatId: event.chatId,
              workspaceId: event.workspaceId,
              title: event.title,
            });
          })
          .catch((error) => {
            console.error("[sumi-title] Automatic title generation failed.", error);
          });
      }
    }

    const startTime = Date.now();
    let capturedResponseMetadata: Omit<ChatMessageMetadata, "parentId"> | undefined;
    const modelInputMessages = prependSystemPrompt(
      mode === "continue-message"
        ? [
            ...messages,
            {
              id: `continue-user:${targetMessageId ?? "unknown"}`,
              role: "user" as const,
              parts: [{ type: "text" as const, text: CONTINUATION_PROMPT }],
              metadata: {
                parentId: lastRequestMessage?.id ?? null,
              },
            } satisfies HanokiUiMessage,
          ]
        : messages,
      chat.id,
      chat.settings.systemPrompt,
    );

    const result = streamText({
      abortSignal: c.req.raw.signal,
      model: languageModel,
      experimental_transform: smoothStream({ chunking: "line" }),
      messages: await convertToModelMessages(modelInputMessages),
      tools: chat.settings.webEnabled ? webTools : undefined,
      stopWhen: chat.settings.webEnabled ? isStepCount(5) : undefined,
    });

    return result.toUIMessageStreamResponse({
      consumeSseStream: consumeStream,
      originalMessages: messages,
      sendReasoning: true,

      generateMessageId:
        mode === "continue-message" && continuationTargetMessage
          ? () => continuationTargetMessage.id
          : createUuidV7,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return { parentId: responseParentId };
        }
        if (part.type === "finish") {
          capturedResponseMetadata = buildResponseMetadata(
            part.totalUsage,
            provider.catalogId as ProviderId,
            model,
            Date.now() - startTime,
            part.finishReason,
          );
          return { parentId: responseParentId, ...capturedResponseMetadata };
        }
        return undefined;
      },
      onEnd: ({ responseMessage }) => {
        if (responseMessage.role !== "assistant") {
          return;
        }

        if (responseMessage.parts.length === 0) {
          return;
        }

        if (mode === "continue-message" && continuationTargetMessage) {
          const mergedParts = mergeContinuationParts(
            continuationTargetMessage.parts as HanokiUiMessage["parts"],
            responseMessage.parts,
          );

          upsertMessage({
            id: continuationTargetMessage.id,
            chatId: chat.id,
            parentId: continuationTargetMessage.parentId,
            role: "assistant",
            parts: mergedParts,
            metadata: {
              ...continuationTargetMessage.metadata,
              parentId: continuationTargetMessage.parentId,
              ...capturedResponseMetadata,
            },
          });

          setChatCurrentBranch(chat.id, getChatCurrentBranchId(chat.id), {
            settingsPatch: {
              modelId: model.id,
            },
          });
          return;
        }

        const parentId = normalizeChatMessageMetadata(
          responseMessage.metadata,
          responseParentId,
        ).parentId;

        upsertMessage({
          id: responseMessage.id,
          chatId: chat.id,
          parentId,
          role: "assistant",
          parts: responseMessage.parts,
          metadata: { parentId, ...capturedResponseMetadata },
        });

        setChatCurrentBranch(chat.id, null, {
          settingsPatch: {
            modelId: model.id,
          },
        });
      },
    });
  });

  return app;
}

function extractUiMessageText(message: HanokiUiMessage): string | null {
  const text = message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text || null;
}

function prependSystemPrompt(
  messages: HanokiUiMessage[],
  chatId: string,
  systemPrompt: string | null | undefined,
) {
  if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
    return messages;
  }

  return [
    {
      id: `system-prompt:${chatId}`,
      role: "system" as const,
      parts: [{ type: "text" as const, text: systemPrompt }],
      metadata: {
        parentId: null,
      },
    } satisfies HanokiUiMessage,
    ...messages,
  ];
}

function mergeContinuationParts(
  originalParts: HanokiUiMessage["parts"],
  responseParts: HanokiUiMessage["parts"],
): HanokiUiMessage["parts"] {
  const continuationSuffix = extractContinuationSuffixParts(originalParts, responseParts);

  if (continuationSuffix.length === 0) {
    return structuredClone(originalParts) as HanokiUiMessage["parts"];
  }

  const mergedParts = structuredClone(originalParts) as HanokiUiMessage["parts"];
  const lastOriginalTextIndex = findLastTextPartIndex(mergedParts);
  const firstSuffixTextIndex = findFirstTextPartIndex(continuationSuffix);

  if (lastOriginalTextIndex === -1 || firstSuffixTextIndex === -1) {
    return [...mergedParts, ...continuationSuffix];
  }

  const suffixPrefixParts = continuationSuffix.slice(0, firstSuffixTextIndex);
  const suffixFirstTextPart = continuationSuffix[firstSuffixTextIndex];
  const suffixRemainingParts = continuationSuffix.slice(firstSuffixTextIndex + 1);
  const originalLastTextPart = mergedParts[lastOriginalTextIndex];

  if (
    !suffixFirstTextPart ||
    suffixFirstTextPart.type !== "text" ||
    !originalLastTextPart ||
    originalLastTextPart.type !== "text"
  ) {
    return [...mergedParts, ...continuationSuffix];
  }

  const nextLastTextPart = {
    ...originalLastTextPart,
    text: `${originalLastTextPart.text}${suffixFirstTextPart.text}`,
    providerMetadata: suffixFirstTextPart.providerMetadata ?? originalLastTextPart.providerMetadata,
    state: suffixFirstTextPart.state ?? originalLastTextPart.state,
  };

  mergedParts[lastOriginalTextIndex] = nextLastTextPart;

  return [...mergedParts, ...suffixPrefixParts, ...suffixRemainingParts];
}

function extractContinuationSuffixParts(
  originalParts: HanokiUiMessage["parts"],
  responseParts: HanokiUiMessage["parts"],
): HanokiUiMessage["parts"] {
  if (!startsWithParts(responseParts, originalParts)) {
    return structuredClone(responseParts) as HanokiUiMessage["parts"];
  }

  return structuredClone(responseParts.slice(originalParts.length)) as HanokiUiMessage["parts"];
}

function startsWithParts(
  candidateParts: readonly HanokiUiMessage["parts"][number][],
  prefixParts: readonly HanokiUiMessage["parts"][number][],
) {
  if (candidateParts.length < prefixParts.length) {
    return false;
  }

  return prefixParts.every(
    (part, index) => JSON.stringify(candidateParts[index]) === JSON.stringify(part),
  );
}

function findFirstTextPartIndex(parts: readonly HanokiUiMessage["parts"][number][]) {
  return parts.findIndex((part) => part.type === "text");
}

function findLastTextPartIndex(parts: readonly HanokiUiMessage["parts"][number][]) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index]?.type === "text") {
      return index;
    }
  }

  return -1;
}
