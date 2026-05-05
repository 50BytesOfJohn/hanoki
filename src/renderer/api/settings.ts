import type { GlobalChatSettingsUpdateInput } from "@shared/ipc";
import "../lib/electron-api";

export const settingsApi = {
  getGlobalChat() {
    return window.electronAPI.getGlobalChatSettings();
  },
  updateGlobalChat(input: GlobalChatSettingsUpdateInput) {
    return window.electronAPI.updateGlobalChatSettings(input);
  },
};
