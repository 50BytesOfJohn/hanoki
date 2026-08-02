import * as React from "react";
import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ChatStatus,
} from "ai";
import { create } from "zustand";

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
    prepareSendMessagesRequest: ({ body, trigger, messages, messageId }) => ({
      body: { ...body, chatId, messages, trigger, messageId },
    }),
  });
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
  const [status, setStatus] = React.useState<ChatStatus>(() => chat?.status ?? "ready");

  React.useEffect(() => {
    if (!chat) return;
    // Sync in case the status changed between render and effect.
    setStatus(chat.status);
    return chat["~registerStatusCallback"](() => setStatus(chat.status));
  }, [chat]);

  return chat ? status : null;
}
