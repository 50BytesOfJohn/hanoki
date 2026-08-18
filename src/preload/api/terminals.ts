import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type TerminalsApi = Pick<
  IpcApi,
  "createTerminal" | "startTerminal" | "writeTerminal" | "resizeTerminal"
>;

export function createTerminalsApi(): TerminalsApi {
  return {
    createTerminal: (workspaceId, title, folderId) =>
      invokeIpc(IPC_CHANNELS.terminals.create, workspaceId, title, folderId),
    startTerminal: (id) => invokeIpc(IPC_CHANNELS.terminals.start, id),
    writeTerminal: (id, data) => invokeIpc(IPC_CHANNELS.terminals.write, id, data),
    resizeTerminal: (id, columns, rows) =>
      invokeIpc(IPC_CHANNELS.terminals.resize, id, columns, rows),
  };
}
