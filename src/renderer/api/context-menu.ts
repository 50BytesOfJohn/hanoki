import type { ContextMenuCommandInput } from "@shared/ipc";
import "../lib/electron-api";

export const contextMenuApi = {
  execute(input: ContextMenuCommandInput) {
    return window.electronAPI.executeContextMenuCommand(input);
  },
};
