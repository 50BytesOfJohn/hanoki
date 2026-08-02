import type {
  GlobalChatSettingsUpdateInput,
  SumiSettingsUpdateInput,
  TerminalToolSettingsUpdateInput,
} from "@shared/ipc";
import "../lib/electron-api";

export const settingsApi = {
  getGlobalChat() {
    return window.electronAPI.getGlobalChatSettings();
  },
  updateGlobalChat(input: GlobalChatSettingsUpdateInput) {
    return window.electronAPI.updateGlobalChatSettings(input);
  },
  getSumi() {
    return window.electronAPI.getSumiSettings();
  },
  updateSumi(input: SumiSettingsUpdateInput) {
    return window.electronAPI.updateSumiSettings(input);
  },
  getTools() {
    return window.electronAPI.getToolSettings();
  },
  updateTerminalTool(input: TerminalToolSettingsUpdateInput) {
    return window.electronAPI.updateTerminalToolSettings(input);
  },
  pickTerminalWorkingDirectory() {
    return window.electronAPI.pickTerminalWorkingDirectory();
  },
};
