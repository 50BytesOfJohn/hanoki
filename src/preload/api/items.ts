import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ItemsApi = Pick<IpcApi, "getItem" | "updateItemTitle" | "moveItem" | "deleteItem">;

export function createItemsApi(): ItemsApi {
  return {
    getItem: (id) => invokeIpc(IPC_CHANNELS.items.get, id),
    updateItemTitle: (id, title) => invokeIpc(IPC_CHANNELS.items.updateTitle, id, title),
    moveItem: (id, folderId) => invokeIpc(IPC_CHANNELS.items.move, id, folderId),
    deleteItem: (id) => invokeIpc(IPC_CHANNELS.items.delete, id),
  };
}
