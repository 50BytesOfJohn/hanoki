import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ChatsApi = Pick<
  IpcApi,
  | "getChat"
  | "createChat"
  | "cloneChat"
  | "updateChatTitle"
  | "updateChatSettings"
  | "moveChat"
  | "deleteChat"
>;

export function createChatsApi(): ChatsApi {
  return {
    getChat: (id) => invokeIpc(IPC_CHANNELS.chats.get, id),
    createChat: (workspaceId, title, folderId) =>
      invokeIpc(IPC_CHANNELS.chats.create, workspaceId, title, folderId),
    cloneChat: (chatId) => invokeIpc(IPC_CHANNELS.chats.clone, chatId),
    updateChatTitle: (id, title) => invokeIpc(IPC_CHANNELS.chats.updateTitle, id, title),
    updateChatSettings: (id, input) => invokeIpc(IPC_CHANNELS.chats.updateSettings, id, input),
    moveChat: (id, folderId) => invokeIpc(IPC_CHANNELS.chats.move, id, folderId),
    deleteChat: (id) => invokeIpc(IPC_CHANNELS.chats.delete, id),
  };
}
