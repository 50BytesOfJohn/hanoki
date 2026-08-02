import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type SettingsApi = Pick<
  IpcApi,
  | "getGlobalChatSettings"
  | "updateGlobalChatSettings"
  | "getSumiSettings"
  | "updateSumiSettings"
  | "getToolSettings"
  | "updateTerminalToolSettings"
  | "pickTerminalWorkingDirectory"
>;

export function createSettingsApi(): SettingsApi {
  return {
    getGlobalChatSettings: () => invokeIpc(IPC_CHANNELS.settings.getGlobalChat),
    updateGlobalChatSettings: (input) => invokeIpc(IPC_CHANNELS.settings.updateGlobalChat, input),
    getSumiSettings: () => invokeIpc(IPC_CHANNELS.settings.getSumi),
    updateSumiSettings: (input) => invokeIpc(IPC_CHANNELS.settings.updateSumi, input),
    getToolSettings: () => invokeIpc(IPC_CHANNELS.settings.getTools),
    updateTerminalToolSettings: (input) =>
      invokeIpc(IPC_CHANNELS.settings.updateTerminalTool, input),
    pickTerminalWorkingDirectory: () =>
      invokeIpc(IPC_CHANNELS.settings.pickTerminalWorkingDirectory),
  };
}
