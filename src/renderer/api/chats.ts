import type { ChatExportFormat } from "@shared/chat/chat-export";
import type { ChatSettingsUpdateInput } from "@shared/ipc";
import "../lib/electron-api";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";

export const chatsApi = {
  get(id: string) {
    return window.electronAPI.getChat(id);
  },

  create(workspaceId: string, title: string, folderId?: string | null) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.createChat(parsedWorkspaceId.value, title, folderId);
  },

  clone(id: string) {
    return window.electronAPI.cloneChat(id);
  },

  export(id: string, format: ChatExportFormat) {
    return window.electronAPI.exportChat(id, format);
  },

  updateTitle(id: string, title: string) {
    return window.electronAPI.updateChatTitle(id, title);
  },

  updateSettings(id: string, input: ChatSettingsUpdateInput) {
    return window.electronAPI.updateChatSettings(id, input);
  },

  move(id: string, folderId: string | null) {
    return window.electronAPI.moveChat(id, folderId);
  },

  delete(id: string) {
    return window.electronAPI.deleteChat(id);
  },
};
