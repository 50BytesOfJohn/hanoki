import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ContextMenuApi = Pick<IpcApi, "showTextContextMenu" | "showMessageContextMenu">;

export function createContextMenuApi(): ContextMenuApi {
  return {
    showTextContextMenu: (input) => invokeIpc(IPC_CHANNELS.contextMenu.showText, input),
    showMessageContextMenu: (input) => invokeIpc(IPC_CHANNELS.contextMenu.showMessage, input),
  };
}
