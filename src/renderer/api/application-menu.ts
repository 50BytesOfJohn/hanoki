import "../lib/electron-api";

export const applicationMenuApi = {
  setUnreadChatCount(count: number) {
    return window.electronAPI.setUnreadChatCount(count);
  },
};
