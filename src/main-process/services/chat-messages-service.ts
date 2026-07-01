import { normalizeChatMessageMetadata, type HanokiUiMessage } from "@shared/chat/message-metadata";
import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { type EditMessageBehavior } from "@shared/ipc";
import { createUuidV7 } from "../db/uuidv7";
import { getChatById, getChatCurrentBranchId, setChatCurrentBranch } from "../chat-tree/repository";
import {
  getMessageById,
  listAllMessagesByChatId,
  listMessagesByChatId,
  listPinnedMessages,
  setMessagePinned,
  type MessageRow,
  upsertMessage,
} from "../messages/repository";

export interface ChatMessagesService {
  listChatMessages(chatId: string, branchId?: string | null): HanokiUiMessage[];
  listAllChatMessages(chatId: string): HanokiUiMessage[];
  switchChatBranch(chatId: string, branchId: string): HanokiUiMessage[];
  editMessage(messageId: string, text: string, behavior: EditMessageBehavior): HanokiUiMessage[];
  setMessagePinned(messageId: string, pinned: boolean): void;
  listPinnedBranches(): PinnedBranchSummary[];
}

function toChatMessage(message: MessageRow, fallbackParentId: string | null): HanokiUiMessage {
  const base = normalizeChatMessageMetadata(message.metadata, fallbackParentId);
  return {
    id: message.id,
    role: message.role,
    parts: message.parts as HanokiUiMessage["parts"],
    metadata: {
      ...base,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      ...(message.siblings !== undefined
        ? { siblings: message.siblings, siblingIndex: message.siblingIndex }
        : {}),
    },
  };
}

export function createChatMessagesService(): ChatMessagesService {
  return {
    listChatMessages(chatId: string, branchId?: string | null): HanokiUiMessage[] {
      const chat = getChatById(chatId);
      if (!chat) {
        throw new Error(`Chat "${chatId}" does not exist.`);
      }

      const effectiveBranchId = branchId ?? getChatCurrentBranchId(chatId);
      const rows = listMessagesByChatId(chat.id, effectiveBranchId);
      return rows.map((row, index) =>
        toChatMessage(row, index > 0 ? (rows[index - 1]?.id ?? null) : null),
      );
    },

    listAllChatMessages(chatId: string): HanokiUiMessage[] {
      const chat = getChatById(chatId);
      if (!chat) {
        throw new Error(`Chat "${chatId}" does not exist.`);
      }

      return listAllMessagesByChatId(chat.id).map((row) => toChatMessage(row, row.parentId));
    },

    switchChatBranch(chatId: string, branchId: string): HanokiUiMessage[] {
      setChatCurrentBranch(chatId, branchId);
      return this.listChatMessages(chatId, branchId);
    },

    editMessage(messageId: string, text: string, behavior: EditMessageBehavior): HanokiUiMessage[] {
      const trimmedText = text.trim();
      if (!trimmedText) {
        throw new Error("Message text cannot be empty.");
      }

      const originalMessage = getMessageById(messageId);
      if (!originalMessage) {
        throw new Error(`Message "${messageId}" does not exist.`);
      }

      const chat = getChatById(originalMessage.chatId);
      if (!chat) {
        throw new Error(`Chat "${originalMessage.chatId}" does not exist.`);
      }

      if (originalMessage.role !== "assistant" && originalMessage.role !== "user") {
        throw new Error(`Message "${messageId}" is not editable.`);
      }

      if (behavior === "overwrite") {
        upsertMessage({
          id: originalMessage.id,
          chatId: chat.id,
          parentId: originalMessage.parentId,
          role: originalMessage.role,
          parts: [
            {
              type: "text",
              text: trimmedText,
            },
          ],
          metadata: {
            ...originalMessage.metadata,
            parentId: originalMessage.parentId,
          },
        });

        const currentBranchId = getChatCurrentBranchId(chat.id);
        return this.listChatMessages(chat.id, currentBranchId ?? undefined);
      }

      const nextMessageId = createUuidV7();
      const parentId = originalMessage.parentId;

      upsertMessage({
        id: nextMessageId,
        chatId: chat.id,
        parentId,
        role: originalMessage.role,
        parts: [
          {
            type: "text",
            text: trimmedText,
          },
        ],
        metadata: { parentId },
      });

      setChatCurrentBranch(chat.id, nextMessageId);

      return this.listChatMessages(chat.id, nextMessageId);
    },

    setMessagePinned(messageId: string, pinned: boolean): void {
      const message = getMessageById(messageId);
      if (!message) {
        throw new Error(`Message "${messageId}" does not exist.`);
      }
      setMessagePinned(messageId, pinned);
    },

    listPinnedBranches(): PinnedBranchSummary[] {
      const rows = listPinnedMessages();
      const results: PinnedBranchSummary[] = [];

      for (const row of rows) {
        const chat = getChatById(row.chatId);
        if (!chat) continue;

        const metadata = row.metadata as Record<string, unknown>;
        const textPreview = extractTextPreview(row);
        const model =
          typeof metadata.model === "string" ? metadata.model : (chat.settings.modelId ?? null);
        const provider = typeof metadata.provider === "string" ? metadata.provider : null;

        results.push({
          messageId: row.id,
          chatId: row.chatId,
          chatTitle: chat.title,
          workspaceId: chat.workspaceId,
          role: row.role,
          textPreview,
          model,
          provider,
          createdAt: row.createdAt,
          pinnedAt: row.updatedAt,
        });
      }

      return results;
    },
  };
}

function extractTextPreview(row: MessageRow): string {
  const parts = Array.isArray(row.parts) ? row.parts : [];
  const text = parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as Record<string, unknown>).type === "text",
    )
    .map((part) => part.text)
    .join("\n");
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}
