import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ChatTreeApi = Pick<
  IpcApi,
  | "getChatTree"
  | "getChatTreeChildren"
  | "getChatTreeUiState"
  | "setChatTreeUiState"
  | "deleteChatTreeItems"
  | "showChatTreeItemContextMenu"
>;

export function createChatTreeApi(): ChatTreeApi {
  return {
    getChatTree: (workspaceId) => invokeIpc(IPC_CHANNELS.chatTree.get, workspaceId),
    getChatTreeChildren: (workspaceId, parentFolderId) =>
      invokeIpc(IPC_CHANNELS.chatTree.getChildren, workspaceId, parentFolderId),
    getChatTreeUiState: (workspaceId) => invokeIpc(IPC_CHANNELS.chatTree.getUiState, workspaceId),
    setChatTreeUiState: (workspaceId, expandedFolderIds) =>
      invokeIpc(IPC_CHANNELS.chatTree.setUiState, workspaceId, expandedFolderIds),
    deleteChatTreeItems: (workspaceId, items) =>
      invokeIpc(IPC_CHANNELS.chatTree.deleteItems, workspaceId, items),
    showChatTreeItemContextMenu: (itemId, itemKind) =>
      invokeIpc(IPC_CHANNELS.chatTree.showContextMenu, itemId, itemKind),
  };
}
