import type { GlobalChatSettingsUpdateInput, SumiSettingsUpdateInput } from "@shared/ipc";
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
};
