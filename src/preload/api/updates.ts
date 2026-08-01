import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type UpdatesApi = Pick<IpcApi, "checkForUpdates" | "installUpdate" | "openReleasesPage">;

export function createUpdatesApi(): UpdatesApi {
  return {
    checkForUpdates: () => invokeIpc(IPC_CHANNELS.updates.check),
    installUpdate: () => invokeIpc(IPC_CHANNELS.updates.install),
    openReleasesPage: () => invokeIpc(IPC_CHANNELS.updates.openReleases),
  };
}
