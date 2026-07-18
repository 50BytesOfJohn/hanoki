import "../lib/electron-api";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import type { DeleteMessageScope, EditMessageBehavior } from "@shared/ipc";
import type { TiptapDocument } from "@shared/tiptap/document";

export const messagesApi = {
  listMessages(chatId: string, branchId?: string | null): Promise<HanokiUiMessage[]> {
    return window.electronAPI.listChatMessages(chatId, branchId);
  },

  listAllMessages(chatId: string): Promise<HanokiUiMessage[]> {
    return window.electronAPI.listAllChatMessages(chatId);
  },

  switchBranch(chatId: string, branchId: string): Promise<HanokiUiMessage[]> {
    return window.electronAPI.switchChatBranch(chatId, branchId);
  },

  editMessage(
    messageId: string,
    content: TiptapDocument | string,
    behavior: EditMessageBehavior,
  ): Promise<HanokiUiMessage[]> {
    return window.electronAPI.editMessage(messageId, content, behavior);
  },

  deleteMessage(messageId: string, scope: DeleteMessageScope): Promise<HanokiUiMessage[]> {
    return window.electronAPI.deleteMessage(messageId, scope);
  },

  setMessagePinned(messageId: string, pinned: boolean): Promise<void> {
    return window.electronAPI.setMessagePinned(messageId, pinned);
  },

  listPinnedBranches(): Promise<PinnedBranchSummary[]> {
    return window.electronAPI.listPinnedBranches();
  },
};
