import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type SettingsApi = Pick<IpcApi, "getGlobalChatSettings" | "updateGlobalChatSettings">;

export function createSettingsApi(): SettingsApi {
  return {
    getGlobalChatSettings: () => invokeIpc(IPC_CHANNELS.settings.getGlobalChat),
    updateGlobalChatSettings: (input) => invokeIpc(IPC_CHANNELS.settings.updateGlobalChat, input),
  };
}
