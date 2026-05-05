import "../lib/electron-api";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import type { EditMessageBehavior } from "@shared/ipc";

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
    text: string,
    behavior: EditMessageBehavior,
  ): Promise<HanokiUiMessage[]> {
    return window.electronAPI.editMessage(messageId, text, behavior);
  },

  setMessagePinned(messageId: string, pinned: boolean): Promise<void> {
    return window.electronAPI.setMessagePinned(messageId, pinned);
  },

  listPinnedBranches(): Promise<PinnedBranchSummary[]> {
    return window.electronAPI.listPinnedBranches();
  },
};
