import { Hono } from "hono";
import {
  consumeStream,
  convertToModelMessages,
  isStepCount,
  smoothStream,
  ToolLoopAgent,
  type LanguageModelUsage,
} from "ai";
import { parseChatId } from "@shared/chat/chat-id";
import { appendContinuationParts, getContinuationParts } from "@shared/chat/continuation";
import { stripReplayedReasoning } from "@shared/chat/reasoning-replay";
import type { ChatTitleUpdatedEvent } from "@shared/events";
import { type ChatMessageMetadata, type HanokiUiMessage } from "@shared/chat/message-metadata";
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
import { buildResponseMetadata, mergeLanguageModelUsage } from "../providers/metadata-extractor";
import type { ProviderId } from "@shared/providers/catalog";
import { readSumiSettings, readTerminalToolSettings } from "../../services/settings-service";
import { generateSumiChatTitle } from "../assistant/title-generation";
import { webTools } from "../assistant/web-tools";
import { createHanokiTools, HANOKI_TOOL_NAMES } from "../assistant/hanoki-tools";
import { createTerminalTools, TERMINAL_TOOL_NAMES } from "../assistant/terminal-tools";
import {
  isHanokiToolEnabledForRequest,
  isTerminalToolEnabledForRequest,
  isWebToolEnabledForRequest,
  parseTiptapDocument,
  validateTiptapMessageParts,
} from "@shared/tiptap/document";
import {
  getTiptapMessageDisplayText,
  normalizeAssistantTiptapParts,
} from "@shared/tiptap/extensions";
import {
  persistGeneratedAssistantMessage,
  persistRequestUserMessage,
} from "../chat-message-persistence";
import { getChatStreamErrorMessage } from "../chat-stream-error";

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

    for (const message of messages) {
      const error = validateTiptapMessageParts(message);
      if (error) {
        return c.json({ error }, 400);
      }
    }

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

    let languageModel: Awaited<ReturnType<typeof createLanguageModel>>;
    try {
      const providerRuntime = resolveProviderRuntimeContext(provider);
      languageModel = await createLanguageModel({
        providerRow: provider,
        providerRuntime,
        providerModelId: model.providerModelId,
      });
    } catch (error) {
      console.error(
        "[ai] Model initialization failed.",
        { chatId: chat.id, modelId: model.id, providerId: provider.id },
        error,
      );
      return c.json({ error: "Model not found or not enabled" }, 400);
    }

    const lastRequestMessage = messages.at(-1);
    let continuationTargetMessage: ReturnType<typeof getMessageById> = null;
    // A trailing assistant message means the client is resuming after a tool
    // approval: the SDK continues that same message, so the response inherits
    // its parent rather than descending from it.
    let responseParentId =
      lastRequestMessage?.role === "assistant"
        ? (lastRequestMessage.metadata?.parentId ??
          getMessageById(lastRequestMessage.id)?.parentId ??
          null)
        : (lastRequestMessage?.id ?? null);

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
      persistRequestUserMessage(chat.id, messages);

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
    let completedStepUsage: LanguageModelUsage | undefined;
    const modelInputMessages =
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
        : messages;
    const latestUserMessage = findLatestUserMessage(messages);
    const isWebEnabledForRequest = isWebToolEnabledForRequest(
      Boolean(chat.settings.webEnabled),
      latestUserMessage,
    );
    const isHanokiEnabledForRequest = isHanokiToolEnabledForRequest(
      Boolean(chat.settings.hanokiEnabled),
      latestUserMessage,
    );
    // The chat opts in via the tools menu or an @Terminal mention, same as the
    // web tools; the app-wide setting only decides whether calls need approval.
    const terminalSettings = readTerminalToolSettings();
    const isTerminalEnabledForRequest = isTerminalToolEnabledForRequest(
      Boolean(chat.settings.terminalEnabled),
      latestUserMessage,
    );
    const needsTerminalApproval =
      terminalSettings.mode === "ask" && !chat.settings.terminalAutoApprove;

    const tools = {
      ...webTools,
      ...createHanokiTools(chat.workspaceId),
      ...createTerminalTools({
        chatId: chat.id,
        configuredCwd: terminalSettings.workingDirectory,
      }),
    };
    const activeTools: (keyof typeof tools)[] = [];
    if (isWebEnabledForRequest) activeTools.push("webSearch", "webFetch");
    if (isHanokiEnabledForRequest) activeTools.push(...HANOKI_TOOL_NAMES);
    if (isTerminalEnabledForRequest) activeTools.push(...TERMINAL_TOOL_NAMES);

    const toolApproval = needsTerminalApproval
      ? Object.fromEntries(TERMINAL_TOOL_NAMES.map((name) => [name, "user-approval" as const]))
      : undefined;
    let currentCallId: string | null = null;
    const loggedErrors = new WeakSet<object>();
    const logError = (message: string, details: Record<string, unknown>, error: unknown) => {
      if (typeof error === "object" && error !== null) {
        if (loggedErrors.has(error)) return;
        loggedErrors.add(error);
      }
      console.error(message, { chatId: chat.id, ...details }, error);
    };
    const agent = new ToolLoopAgent({
      model: languageModel,
      instructions: chat.settings.systemPrompt?.trim() || undefined,
      temperature: chat.settings.modelConfig?.temperature,
      tools,
      activeTools,
      ...(toolApproval ? { toolApproval } : {}),
      stopWhen: isStepCount(100),
      onStart: ({ callId: startedCallId, provider: sdkProvider, modelId: sdkModelId }) => {
        currentCallId = startedCallId;
        console.info("[ai] Request started.", {
          callId: currentCallId,
          chatId: chat.id,
          workspaceId: chat.workspaceId,
          provider: sdkProvider,
          modelId: sdkModelId,
          temperature: chat.settings.modelConfig?.temperature ?? null,
          hasCustomSystemPrompt: Boolean(chat.settings.systemPrompt?.trim()),
          activeTools,
        });
      },
      onToolExecutionStart: ({ callId: generationCallId, toolCall }) => {
        console.info("[ai] Tool started.", {
          callId: generationCallId,
          chatId: chat.id,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      },
      onToolExecutionEnd: ({ callId: generationCallId, toolCall, toolExecutionMs, toolOutput }) => {
        const details = {
          callId: generationCallId,
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          durationMs: toolExecutionMs,
        };
        if (toolOutput.type === "tool-error") {
          logError("[ai] Tool failed.", details, toolOutput.error);
          return;
        }
        console.info("[ai] Tool completed.", { chatId: chat.id, ...details });
      },
      onStepEnd: ({ usage }) => {
        completedStepUsage = mergeLanguageModelUsage(completedStepUsage, usage);
      },
      onEnd: ({ callId: endedCallId, stepNumber, finishReason, usage, warnings }) => {
        console.info("[ai] Request completed.", {
          callId: endedCallId,
          chatId: chat.id,
          steps: stepNumber + 1,
          finishReason,
          durationMs: Date.now() - startTime,
          totalTokens: usage.totalTokens,
          warningCount: warnings?.length ?? 0,
        });
        if (warnings?.length) {
          console.warn("[ai] Request warnings.", {
            callId: endedCallId,
            chatId: chat.id,
            warnings,
          });
        }
      },
    });

    const result = await agent.stream({
      abortSignal: c.req.raw.signal,
      experimental_transform: smoothStream({ chunking: "line" }),
      messages: stripReplayedReasoning(
        await convertToModelMessages<HanokiUiMessage>(modelInputMessages, {
          convertDataPart: (part) => {
            if (part.type !== "data-tiptap") {
              return undefined;
            }
            const parsed = parseTiptapDocument(part.data);
            if (!parsed.ok) {
              throw new Error(parsed.error);
            }
            return { type: "text", text: parsed.value.modelText };
          },
        }),
      ),
    });

    // The stream reports failures as an `error` chunk rather than by rejecting,
    // so `onEnd` still runs afterwards; this is how it knows not to persist.
    let streamErrorMessage: string | null = null;

    return result.toUIMessageStreamResponse({
      consumeSseStream: consumeStream,
      originalMessages: messages,
      sendReasoning: true,
      onError: (error) => {
        capturedResponseMetadata = buildResponseMetadata(
          completedStepUsage,
          provider.catalogId as ProviderId,
          model,
          Date.now() - startTime,
          "error",
        );
        logError("[ai] Response stream failed.", { callId: currentCallId }, error);
        streamErrorMessage = getChatStreamErrorMessage(error);
        return streamErrorMessage;
      },

      generateMessageId:
        mode === "continue-message" && continuationTargetMessage
          ? () => continuationTargetMessage.id
          : createUuidV7,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          capturedResponseMetadata = {
            provider: provider.catalogId,
            model: model.id,
          };
          return { parentId: responseParentId, ...capturedResponseMetadata };
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
      onEnd: ({ isAborted, responseMessage }) => {
        if (isAborted) {
          capturedResponseMetadata = buildResponseMetadata(
            completedStepUsage,
            provider.catalogId as ProviderId,
            model,
            Date.now() - startTime,
            "abort",
          );
        }

        if (responseMessage.role !== "assistant") {
          return;
        }

        if (responseMessage.parts.length === 0) {
          return;
        }

        if (mode === "continue-message" && continuationTargetMessage) {
          // A continuation edits a message that is already stored. Writing a
          // failed attempt would leave the client (which rolls back) and the
          // database disagreeing about the same message id, and the next
          // continuation would then merge against a copy it no longer matches.
          if (streamErrorMessage !== null) {
            return;
          }

          const continuationParts = getContinuationParts(
            (lastRequestMessage?.parts ?? []) as HanokiUiMessage["parts"],
            responseMessage.parts,
          );
          const mergedParts = appendContinuationParts(
            continuationTargetMessage.parts as HanokiUiMessage["parts"],
            normalizeAssistantTiptapParts(continuationParts),
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

        persistGeneratedAssistantMessage({
          chatId: chat.id,
          message: {
            ...responseMessage,
            parts: normalizeAssistantTiptapParts(responseMessage.parts),
          },
          fallbackParentId: responseParentId,
          responseMetadata: capturedResponseMetadata,
          modelId: model.id,
        });
      },
    });
  });

  return app;
}

function extractUiMessageText(message: HanokiUiMessage): string | null {
  const text = getTiptapMessageDisplayText(message).trim();

  return text || null;
}

function findLatestUserMessage(messages: HanokiUiMessage[]): HanokiUiMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message;
    }
  }
  return undefined;
}
