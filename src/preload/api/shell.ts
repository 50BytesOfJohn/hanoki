import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { externalUrlToOpen } from "@shared/external-url";
import { invokeIpc } from "../invoke";

type ShellApi = Pick<IpcApi, "openExternal">;

export function createShellApi(): ShellApi {
  return {
    openExternal: (url) => {
      const allowed = externalUrlToOpen(url);
      if (!allowed) return Promise.resolve();
      return invokeIpc(IPC_CHANNELS.shell.openExternal, allowed);
    },
  };
}
