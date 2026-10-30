import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ApplicationMenuApi = Pick<IpcApi, "setUnreadChatCount">;

export function createApplicationMenuApi(): ApplicationMenuApi {
  return {
    setUnreadChatCount: (count) =>
      invokeIpc(IPC_CHANNELS.applicationMenu.setUnreadChatCount, count),
  };
}
