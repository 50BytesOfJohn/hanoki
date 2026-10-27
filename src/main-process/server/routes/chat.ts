import { Hono } from "hono";
import {
  consumeStream,
  convertToModelMessages,
  isStepCount,
  smoothStream,
  ToolLoopAgent,
  type LanguageModelUsage,
  type ToolApprovalStatus,
} from "ai";
import { parseChatId } from "@shared/chat/chat-id";
import { appendContinuationParts, getContinuationParts } from "@shared/chat/continuation";
import { stripReplayedReasoning } from "@shared/chat/reasoning-replay";
import { insertRevisionTurn } from "@shared/chat/revision";
import { decideToolApproval } from "@shared/chat/tool-approval";
import type {
  ChatCostUpdatedEvent,
  ChatGenerationRequestedEvent,
  ChatMessagesChangedEvent,
  ChatTreeChangedEvent,
} from "@shared/events";
import { type ChatMessageMetadata, type HanokiUiMessage } from "@shared/chat/message-metadata";
import { createUuidV7 } from "@shared/uuidv7";
import {
  addChatResponseCost,
  getChatById,
  getChatCurrentBranchId,
  setChatCurrentBranch,
} from "../../chat-tree/repository";
import { getMessageById, listAllMessagesByChatId, upsertMessage } from "../../messages/repository";
import { getModelById, recordModelUsage } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { createLanguageModel } from "../providers/language-model-factory";
import { buildChatProviderOptions } from "../providers/chat-provider-options";
import { getModelReasoningEfforts } from "@shared/models/reasoning";
import { getModelTemperatureMax } from "@shared/models/temperature";
import { buildResponseMetadata, mergeLanguageModelUsage } from "../providers/metadata-extractor";
import type { ProviderId } from "@shared/providers/catalog";
import { readSumiSettings, readTerminalToolSettings } from "../../services/settings-service";
import { generateSumiItemTitle } from "../assistant/title-generation";
import { webTools } from "../assistant/web-tools";
import { formatAttachedContextInstructions } from "@shared/chat/attached-items";
import {
  collectDiscoveredHanokiTools,
  collectDiscoveredHanokiToolsFromMessages,
  createHanokiTools,
  hanokiSendKickNeedsApproval,
  HANOKI_CORE_TOOL_NAMES,
  HANOKI_READ_TOOL_NAMES,
  type HanokiTerminalPort,
  resolveAttachedItemPointers,
} from "../assistant/hanoki-tools";
import { createTerminalTools, TERMINAL_TOOL_NAMES } from "../assistant/terminal-tools";
import {
  getTurnItemMentions,
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
import { beginChatGeneration, endChatGeneration } from "../chat-generation-gate";
import { resolveRevisionContext } from "../chat-revision";

const CONTINUATION_PROMPT =
  "Continue directly from where you left off. Do not repeat any previous content, do not add any introduction or summary. Just pick up exactly at the end of your last sentence.";

interface CreateChatRouteOptions {
  onChatTreeChanged?: (event: Omit<ChatTreeChangedEvent, "type">) => void;
  onChatMessagesChanged?: (event: Omit<ChatMessagesChangedEvent, "type">) => void;
  onChatCostUpdated?: (event: Omit<ChatCostUpdatedEvent, "type">) => void;
  onChatGenerationRequested?: (event: Omit<ChatGenerationRequestedEvent, "type">) => void;
  flushMarkdownContent?: (id: string) => {
    id: string;
    workspaceId: string;
    title: string;
    type: "markdown";
    data: { markdown: string };
  };
  terminals?: HanokiTerminalPort;
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

    // The model can be switched while this reply streams; that pick is for the
    // next message, so finishing must not write this request's model over it.
    const getModelIdToSave = () =>
      getChatById(chat.id)?.data.settings.modelId === chat.data.settings.modelId
        ? model.id
        : undefined;

    const provider = getProviderById(model.providerId);
    if (!provider) {
      return c.json({ error: "Model not found or not enabled" }, 400);
    }

    const temperatureMax = getModelTemperatureMax(provider.catalogId as ProviderId, model.metadata);
    const savedTemperature = chat.data.settings.modelConfig?.temperature;
    // Overrides survive model switches. Leave unsupported models at their own
    // default, and report an incompatible range before persisting a message.
    const temperature = temperatureMax === null ? undefined : savedTemperature;
    if (temperature !== undefined && temperatureMax !== null && temperature > temperatureMax) {
      return c.json(
        {
          error: `This model accepts temperature from 0 to ${temperatureMax}. Adjust it in Chat Settings or use Default.`,
        },
        400,
      );
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

    const revisionContext = resolveRevisionContext({
      chat,
      body,
      messages,
      mode,
      responseParentId,
    });
    if (!revisionContext.ok) {
      return c.json({ error: revisionContext.error }, 400);
    }
    const revisionMetadata = revisionContext.revision;

    const shouldAutoGenerateTitle =
      mode !== "continue-message" &&
      lastRequestMessage?.role === "user" &&
      !listAllMessagesByChatId(chat.id).some((message) => message.role === "user");

    if (mode !== "continue-message" && lastRequestMessage?.role === "user") {
      persistRequestUserMessage(chat.id, messages);

      const titleGeneration = readSumiSettings().titleGeneration;
      if (shouldAutoGenerateTitle && titleGeneration.enabled && titleGeneration.autoGenerate) {
        void generateSumiItemTitle({
          itemId: chat.id,
          sourcePrompt: extractUiMessageText(lastRequestMessage),
          mode: "auto",
        }).catch((error) => {
          console.error("[sumi-title] Automatic title generation failed.", error);
        });
      }
    }

    const startTime = Date.now();
    let capturedResponseMetadata: Omit<ChatMessageMetadata, "parentId"> | undefined;
    let completedStepUsage: LanguageModelUsage | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;
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
        : revisionMetadata
          ? insertRevisionTurn(messages, revisionMetadata)
          : messages;
    const latestUserMessage = findLatestUserMessage(messages);
    const isWebEnabledForRequest = isWebToolEnabledForRequest(
      Boolean(chat.data.settings.webEnabled),
      latestUserMessage,
    );
    const isHanokiEnabledForRequest = isHanokiToolEnabledForRequest(
      Boolean(chat.data.settings.hanokiEnabled),
      latestUserMessage,
    );
    const itemMentions = getTurnItemMentions(messages);
    const mentionedPointers = resolveAttachedItemPointers(chat.workspaceId, itemMentions);
    const mentionedInstructions = formatAttachedContextInstructions(mentionedPointers);
    // The chat opts in via the tools menu or an @Terminal mention, same as the
    // web tools; the app-wide setting only decides whether calls need approval.
    const terminalSettings = readTerminalToolSettings();
    const isTerminalEnabledForRequest = isTerminalToolEnabledForRequest(
      Boolean(chat.data.settings.terminalEnabled),
      latestUserMessage,
    );

    const tools = {
      ...webTools,
      ...createHanokiTools({
        workspaceId: chat.workspaceId,
        chatId: chat.id,
        terminals: options?.terminals,
        flushMarkdownContent: options?.flushMarkdownContent,
        onTreeChanged: () => options?.onChatTreeChanged?.({ workspaceId: chat.workspaceId }),
        onMessagesChanged: (targetChatId) =>
          options?.onChatMessagesChanged?.({ chatId: targetChatId }),
        onGenerationRequested: (targetChatId, modelId) =>
          options?.onChatGenerationRequested?.({ chatId: targetChatId, modelId }),
      }),
      ...createTerminalTools({
        chatId: chat.id,
        configuredCwd: terminalSettings.workingDirectory,
      }),
    };
    // Tool search: only core Hanoki tools start active. Deferred tools are
    // discovered with hanokiFindTools and activated by prepareStep below, so
    // the model does not pay for every definition on every turn/provider.
    const buildActiveTools = (discovered: readonly string[]): (keyof typeof tools)[] => {
      const active: (keyof typeof tools)[] = [];
      if (isWebEnabledForRequest) active.push("webSearch", "webFetch");
      if (isHanokiEnabledForRequest) {
        active.push(...(HANOKI_CORE_TOOL_NAMES as (keyof typeof tools)[]));
        for (const name of discovered) {
          if (name in tools && !active.includes(name as keyof typeof tools)) {
            active.push(name as keyof typeof tools);
          }
        }
      } else if (itemMentions.length > 0) {
        active.push(...(HANOKI_READ_TOOL_NAMES as unknown as (keyof typeof tools)[]));
      }
      if (isTerminalEnabledForRequest) active.push(...TERMINAL_TOOL_NAMES);
      return active;
    };
    // Discovery survives approval resumptions and follow-up turns: recover
    // tools loaded by hanokiFindTools in earlier requests from the history.
    const historyDiscovered = isHanokiEnabledForRequest
      ? collectDiscoveredHanokiToolsFromMessages(messages)
      : [];
    const activeTools = buildActiveTools(historyDiscovered);

    // One policy for every tool. Settings are re-read per call so "Allow for
    // this chat" or a mode switch made mid-generation applies to the next call.
    const toolApproval = ({
      toolCall,
    }: {
      toolCall: { toolName: string; input: unknown };
    }): ToolApprovalStatus => {
      if (
        toolCall.toolName === "hanokiSendMessage" &&
        !hanokiSendKickNeedsApproval(
          chat.id,
          (toolCall.input ?? {}) as { kick?: boolean; chatId?: string },
        )
      ) {
        return undefined;
      }
      const settings = getChatById(chat.id)?.data.settings ?? chat.data.settings;
      const decision = decideToolApproval(toolCall.toolName, {
        mode: settings.toolApprovalMode,
        allowedTools: settings.allowedTools,
        computerToolsAlwaysAllowed: readTerminalToolSettings().mode === "always",
      });
      return decision.type === "not-applicable" ? undefined : decision;
    };
    let currentCallId: string | null = null;
    const loggedErrors = new WeakSet<object>();
    const logError = (message: string, details: Record<string, unknown>, error: unknown) => {
      if (typeof error === "object" && error !== null) {
        if (loggedErrors.has(error)) return;
        loggedErrors.add(error);
      }
      console.error(message, { chatId: chat.id, ...details }, error);
    };
    // The setting outlives the model it was chosen for, so a saved effort the
    // current model does not offer is dropped rather than sent blindly.
    const savedReasoningEffort = chat.data.settings.modelConfig?.reasoningEffort;
    const reasoningEffort =
      savedReasoningEffort &&
      getModelReasoningEfforts(provider.catalogId as ProviderId, model.metadata).includes(
        savedReasoningEffort,
      )
        ? savedReasoningEffort
        : undefined;
    // Feeds the picker's recent section with the pair that was actually sent.
    recordModelUsage(model.id, reasoningEffort ?? "");
    const agent = new ToolLoopAgent({
      model: languageModel,
      instructions:
        [
          chat.data.settings.systemPrompt?.trim() || "",
          mentionedInstructions ?? "",
          isHanokiEnabledForRequest
            ? "Additional Hanoki tools (creating, editing, deleting, moving, renaming, sending messages, and Hanoki terminals) are loaded on demand. Call hanokiFindTools with your goal to discover and load them before saying an action is unavailable."
            : "",
        ]
          .filter((part) => part.length > 0)
          .join("\n\n") || undefined,
      temperature,
      reasoning: reasoningEffort,
      providerOptions: buildChatProviderOptions(
        provider.catalogId as ProviderId,
        reasoningEffort,
        temperature,
        model.providerModelId,
      ),
      tools,
      activeTools,
      toolApproval,
      ...(isHanokiEnabledForRequest
        ? {
            prepareStep: ({ steps }: { steps: readonly unknown[] }) => ({
              activeTools: buildActiveTools([
                ...historyDiscovered,
                ...collectDiscoveredHanokiTools(steps),
              ]),
            }),
          }
        : {}),
      stopWhen: isStepCount(100),
      onStart: ({ callId: startedCallId, provider: sdkProvider, modelId: sdkModelId }) => {
        beginChatGeneration(chat.id);
        currentCallId = startedCallId;
        console.info("[ai] Request started.", {
          callId: currentCallId,
          chatId: chat.id,
          workspaceId: chat.workspaceId,
          provider: sdkProvider,
          modelId: sdkModelId,
          temperature: temperature ?? null,
          reasoning: reasoningEffort ?? null,
          hasCustomSystemPrompt: Boolean(chat.data.settings.systemPrompt?.trim()),
          activeTools,
          revision: Boolean(revisionMetadata),
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
          lastStepUsage,
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
        // Read in stream order so it is always set before `finish` arrives.
        if (part.type === "finish-step") {
          lastStepUsage = part.usage;
          return undefined;
        }
        if (part.type === "start") {
          capturedResponseMetadata = {
            provider: provider.catalogId,
            model: model.id,
          };
          return {
            parentId: responseParentId,
            ...capturedResponseMetadata,
            ...(revisionMetadata && { revision: revisionMetadata }),
          };
        }
        if (part.type === "finish") {
          capturedResponseMetadata = buildResponseMetadata(
            part.totalUsage,
            provider.catalogId as ProviderId,
            model,
            Date.now() - startTime,
            part.finishReason,
            lastStepUsage,
          );
          return {
            parentId: responseParentId,
            ...capturedResponseMetadata,
            ...(revisionMetadata && { revision: revisionMetadata }),
          };
        }
        return undefined;
      },
      onEnd: ({ isAborted, responseMessage }) => {
        endChatGeneration(chat.id);
        if (isAborted) {
          capturedResponseMetadata = buildResponseMetadata(
            completedStepUsage,
            provider.catalogId as ProviderId,
            model,
            Date.now() - startTime,
            "abort",
            lastStepUsage,
          );
        }

        // Charged before any early return: failed continuations and replies
        // that are never stored still cost money. Metadata is only missing
        // when the stream never started.
        if (capturedResponseMetadata) {
          const chatCost = addChatResponseCost(chat.id, capturedResponseMetadata.cost);
          if (chatCost) {
            options?.onChatCostUpdated?.({ chatId: chat.id, cost: chatCost });
          }
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

          const modelIdToSave = getModelIdToSave();
          setChatCurrentBranch(chat.id, getChatCurrentBranchId(chat.id), {
            settingsPatch: modelIdToSave ? { modelId: modelIdToSave } : undefined,
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
          // Streamed metadata is not persisted, so the revision link is added
          // here; capturedResponseMetadata is reassigned on error and abort.
          responseMetadata: revisionMetadata
            ? { ...capturedResponseMetadata, revision: revisionMetadata }
            : capturedResponseMetadata,
          modelId: getModelIdToSave(),
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
