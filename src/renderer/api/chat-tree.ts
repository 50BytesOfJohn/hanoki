import type { ChatTreeItemRef } from "@shared/ipc";
import "../lib/electron-api";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";

export const chatTreeApi = {
  getTree(workspaceId: string) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.getChatTree(parsedWorkspaceId.value);
  },

  getChildren(workspaceId: string, parentFolderId: string | null) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.getChatTreeChildren(parsedWorkspaceId.value, parentFolderId);
  },

  getUiState(workspaceId: string) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.getChatTreeUiState(parsedWorkspaceId.value);
  },

  setUiState(workspaceId: string, expandedFolderIds: string[]) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.setChatTreeUiState(parsedWorkspaceId.value, expandedFolderIds);
  },

  deleteItems(workspaceId: string, items: ChatTreeItemRef[]) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.deleteChatTreeItems(parsedWorkspaceId.value, items);
  },
};
