import { normalizeChatMessageMetadata, type HanokiUiMessage } from "@shared/chat/message-metadata";
import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { type DeleteMessageScope, type EditMessageBehavior } from "@shared/ipc";
import {
  createTiptapDocumentFromText,
  createTiptapMessageParts,
  parseTiptapDocument,
  type TiptapDocument,
} from "@shared/tiptap/document";
import { getTiptapMessageDisplayText } from "@shared/tiptap/extensions";
import { buildWorkflowMessageParts } from "@shared/workflow/message-parts";
import {
  getAllWorkflowStepPasses,
  getWorkflowRun,
  getWorkflowStepHistory,
  getWorkflowSteps,
} from "@shared/workflow/run";
import { createUuidV7 } from "../db/uuidv7";
import { getChatById, getChatCurrentBranchId, setChatCurrentBranch } from "../chat-tree/repository";
import {
  deleteMessageSubtree,
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
  editMessage(
    messageId: string,
    content: TiptapDocument | string,
    behavior: EditMessageBehavior,
  ): HanokiUiMessage[];
  deleteMessage(messageId: string, scope: DeleteMessageScope): HanokiUiMessage[];
  setMessagePinned(messageId: string, pinned: boolean): void;
  listPinnedBranches(): PinnedBranchSummary[];
  applyWorkflowStepAsMessage(
    messageId: string,
    nodeId: string,
    iteration?: number,
  ): HanokiUiMessage[];
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

    editMessage(
      messageId: string,
      content: TiptapDocument | string,
      behavior: EditMessageBehavior,
    ): HanokiUiMessage[] {
      const document =
        typeof content === "string" ? createTiptapDocumentFromText(content) : content;
      const parsedDocument = parseTiptapDocument(document);
      if (!parsedDocument.ok || !parsedDocument.value.displayText.trim()) {
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

      const nextContentParts = createTiptapMessageParts(parsedDocument.value.document);
      if (originalMessage.role === "assistant" && nextContentParts[0]?.type === "text") {
        nextContentParts[0] = { ...nextContentParts[0], state: "done" };
      }

      if (behavior === "overwrite") {
        upsertMessage({
          id: originalMessage.id,
          chatId: chat.id,
          parentId: originalMessage.parentId,
          role: originalMessage.role,
          parts: replaceTextContentParts(originalMessage.parts, nextContentParts),
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
        parts: replaceTextContentParts(originalMessage.parts, nextContentParts),
        metadata: { parentId },
      });

      setChatCurrentBranch(chat.id, nextMessageId);

      return this.listChatMessages(chat.id, nextMessageId);
    },

    deleteMessage(messageId: string, scope: DeleteMessageScope): HanokiUiMessage[] {
      const { chatId, parentId, deletedIds } = deleteMessageSubtree(messageId, scope);

      // If the current branch pointer was deleted, fall back to the deleted
      // message's parent so history resolution keeps working.
      const currentBranchId = getChatCurrentBranchId(chatId);
      if (currentBranchId !== null && deletedIds.has(currentBranchId)) {
        setChatCurrentBranch(chatId, parentId);
      }

      return this.listChatMessages(chatId);
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
          typeof metadata.model === "string"
            ? metadata.model
            : (chat.data.settings.modelId ?? null);
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

    applyWorkflowStepAsMessage(
      messageId: string,
      nodeId: string,
      iteration?: number,
    ): HanokiUiMessage[] {
      const source = getMessageById(messageId);
      if (!source || source.role !== "assistant") {
        throw new Error(`Message "${messageId}" does not exist.`);
      }
      // SAFETY: stored message parts are UI message parts; this only reads the workflow ones.
      const message = { parts: source.parts as HanokiUiMessage["parts"] };
      const run = getWorkflowRun(message);
      const latest = getWorkflowSteps(message).get(nodeId);
      const step =
        iteration === undefined || iteration === (latest?.iteration ?? 1)
          ? latest
          : getWorkflowStepHistory(message)
              .get(nodeId)
              ?.find((pass) => (pass.iteration ?? 1) === iteration);
      if (!run || !step?.output.trim()) {
        throw new Error("That step has no output to use.");
      }

      // A new version beside the original, like a regeneration; nothing is overwritten.
      const id = createUuidV7();
      const metadata = normalizeChatMessageMetadata(source.metadata, source.parentId);
      upsertMessage({
        id,
        chatId: source.chatId,
        parentId: source.parentId,
        role: "assistant",
        // Picking a step settles the run: a stopped or failed status would no
        // longer describe this version.
        // Every pass of every step is kept, a loop's earlier ones included.
        parts: buildWorkflowMessageParts(
          {
            ...run,
            status: "done",
            outputNodeId: nodeId,
            ...(step === latest ? {} : { outputIteration: step.iteration ?? 1 }),
          },
          getAllWorkflowStepPasses(message),
          step.output,
        ),
        metadata: {
          parentId: source.parentId,
          ...(metadata.provider ? { provider: metadata.provider } : {}),
          ...(step.modelId ? { model: step.modelId } : {}),
          finishReason: "stop",
        },
      });
      setChatCurrentBranch(source.chatId, id);
      return this.listChatMessages(source.chatId, id);
    },
  };
}

function extractTextPreview(row: MessageRow): string {
  const text = getTiptapMessageDisplayText({
    parts: row.parts as HanokiUiMessage["parts"],
    role: row.role,
  });
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}

function replaceTextContentParts(
  originalParts: unknown[],
  nextContentParts: HanokiUiMessage["parts"],
): unknown[] {
  const nextPart = nextContentParts[0];
  if (!nextPart) {
    return originalParts;
  }

  const result: unknown[] = [];
  let didInsert = false;
  for (const part of originalParts) {
    const isTextContent =
      typeof part === "object" &&
      part !== null &&
      ((part as Record<string, unknown>).type === "text" ||
        (part as Record<string, unknown>).type === "data-tiptap");

    if (!isTextContent) {
      result.push(part);
      continue;
    }
    if (!didInsert) {
      result.push(nextPart);
      didInsert = true;
    }
  }

  return didInsert ? result : [nextPart, ...result];
}
