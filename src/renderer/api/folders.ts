import "../lib/electron-api";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";

export const foldersApi = {
  create(workspaceId: string, name: string, parentId?: string | null) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.createFolder(parsedWorkspaceId.value, name, parentId);
  },

  updateName(id: string, name: string) {
    return window.electronAPI.updateFolderName(id, name);
  },

  move(id: string, parentId: string | null) {
    return window.electronAPI.moveFolder(id, parentId);
  },

  delete(id: string) {
    return window.electronAPI.deleteFolder(id);
  },
};
