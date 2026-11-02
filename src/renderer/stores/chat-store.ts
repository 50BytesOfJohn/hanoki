import * as React from "react";
import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ChatStatus,
} from "ai";
import { create } from "zustand";

import { messagesApi } from "@/api/messages";
import { flushPendingWorkflowSaves } from "@/features/workflow/workflow-graph-store";
import { chatMessageMetadataSchema, type HanokiUiMessage } from "@shared/chat/message-metadata";
import { createUuidV7 } from "@shared/uuidv7";
import { normalizeAssistantTiptapParts } from "@shared/tiptap/extensions";

interface ChatStoreState {
  chatEntries: Map<string, Chat<HanokiUiMessage>>;
  getOrCreateChat: (chatId: string, apiUrl: string) => Chat<HanokiUiMessage>;
  removeChat: (chatId: string) => void;
}

export function createChatTransport(apiUrl: string, chatId: string) {
  return new DefaultChatTransport<HanokiUiMessage>({
    api: apiUrl,
    prepareSendMessagesRequest: async ({ body, trigger, messages, messageId }) => {
      // The server runs workflows as stored, so edits still waiting to save go first.
      await flushPendingWorkflowSaves();
      return {
        body: { ...body, chatId, messages: stripWorkflowRuns(messages), trigger, messageId },
      };
    },
  });
}

/** Runs are for the user; the server reads them from storage when it needs one. */
function stripWorkflowRuns(messages: HanokiUiMessage[]): HanokiUiMessage[] {
  return messages.map((message) =>
    message.parts.some(
      (part) => part.type === "data-workflowRun" || part.type === "data-workflowStep",
    )
      ? {
          ...message,
          parts: message.parts.filter(
            (part) => part.type !== "data-workflowRun" && part.type !== "data-workflowStep",
          ),
        }
      : message,
  );
}

/** Asks the server to stop the chat's workflow run; false when none is running. */
export async function stopChatWorkflowRun(apiUrl: string, chatId: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/workflow/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return typeof result === "object" && result !== null && "stopped" in result
      ? result.stopped === true
      : false;
  } catch {
    return false;
  }
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  chatEntries: new Map(),

  getOrCreateChat: (chatId, apiUrl) => {
    const existing = get().chatEntries.get(chatId);
    if (existing) return existing;

    let chat: Chat<HanokiUiMessage>;
    chat = new Chat<HanokiUiMessage>({
      id: chatId,
      generateId: createUuidV7,
      transport: createChatTransport(apiUrl, chatId),
      messageMetadataSchema: chatMessageMetadataSchema,
      // Once every pending tool approval has an answer, resume the generation
      // automatically instead of making the user send another message.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: ({ message, messages }) => {
        if (message.role !== "assistant") {
          return;
        }
        chat.messages = messages.map((candidate) =>
          candidate.id === message.id
            ? { ...candidate, parts: normalizeAssistantTiptapParts(candidate.parts) }
            : candidate,
        );
      },
    });

    set((state) => {
      const next = new Map(state.chatEntries);
      next.set(chatId, chat);
      return { chatEntries: next };
    });

    return chat;
  },

  removeChat: (chatId) => {
    set((state) => {
      const next = new Map(state.chatEntries);
      next.delete(chatId);
      return { chatEntries: next };
    });
  },
}));

/**
 * Subscribes to the streaming status of a single chat by chatId.
 * Returns null if the chat has never been opened (not in the store).
 * Only the subscribing component re-renders on status change.
 */
export function useChatStatus(chatId: string): ChatStatus | null {
  const chat = useChatStore((s) => s.chatEntries.get(chatId) ?? null);
  const subscribe = React.useCallback(
    (onChange: () => void) => chat?.["~registerStatusCallback"](onChange) ?? (() => {}),
    [chat],
  );

  return React.useSyncExternalStore(subscribe, () => chat?.status ?? null);
}

const pendingHistoryLoads = new WeakMap<Chat<HanokiUiMessage>, Promise<void>>();

/**
 * Fills an empty chat with its saved messages. Shared by the mounted chat and the sidebar's
 * press-time preload, so a chat opened mid-load neither fetches twice nor renders empty.
 */
export function loadChatHistory(chat: Chat<HanokiUiMessage>): Promise<void> {
  if (chat.messages.length > 0) return Promise.resolve();

  const pending = pendingHistoryLoads.get(chat);
  if (pending) return pending;

  const load = messagesApi
    .listMessages(chat.id)
    .then((messages) => {
      // A message sent while this was loading is newer than what was read.
      if (chat.messages.length === 0) chat.messages = messages;
    })
    .finally(() => pendingHistoryLoads.delete(chat));
  pendingHistoryLoads.set(chat, load);
  return load;
}
