import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ContextMenuApi = Pick<IpcApi, "executeContextMenuCommand">;

export function createContextMenuApi(): ContextMenuApi {
  return {
    executeContextMenuCommand: (input) => invokeIpc(IPC_CHANNELS.contextMenu.execute, input),
  };
}
