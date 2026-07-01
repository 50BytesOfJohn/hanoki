import { workspaceApi } from "@/api/workspaces";
import type { PersistStorage } from "zustand/middleware";
import type { WorkspaceStoreValues } from "../types";
import { AsyncDebouncer } from "@tanstack/react-pacer";

export const syncWorkspaceSettingsStateToSqlite = new AsyncDebouncer(
  async (state: WorkspaceStoreValues) => {
    if (!state.workspace) return;

    await workspaceApi.updateSettings(state.workspace.id, {
      currentChatId: state.currentChatId,
      tabs: state.tabs.map((t) => ({
        chatId: t.chatId,
        id: t.id,
        type: "chat",
      })),

      chatTreeExpandedFolderIds: state.expandedTreeNodes,
    });
  },
  {
    wait: 5_000,

    onSuccess: () => {},

    onError: (error) => {
      console.error("[workspace-store] Sync Settings Error", error);
    },
  },
);

export const sqliteStorage: PersistStorage<WorkspaceStoreValues> = {
  getItem: async (_name: string) => {
    /**
     * Runs on store creation, so we get the active workspace, then the state of workspace and "create" a store. Yuhu!
     */
    try {
      /**
       * Let's get active workspace with it's settings in a single call (Woah)
       */
      const { settings, ...workspace } = await workspaceApi.getActive({
        includeSettings: true,
      });

      /**
       * No active workspace should never happen
       */
      if (!workspace) return null;

      return {
        state: {
          state: "idle",
          workspace,

          // CURRENT CHAT + TABS
          currentChatId: settings?.currentChatId ?? null,
          tabs:
            settings?.tabs?.map((t) => ({
              id: t.id,
              type: "chat",
              chatId: t.chatId,
            })) ?? [],

          expandedTreeNodes: settings?.chatTreeExpandedFolderIds ?? [],
        } satisfies WorkspaceStoreValues,
      };
    } catch (e) {
      console.error("Failed to load initial UI state:", e);
      return null;
    }
  },

  setItem: async (_name: string, value) => {
    try {
      const state = value.state;
      await syncWorkspaceSettingsStateToSqlite.maybeExecute(state);
    } catch (e) {
      console.error("[workspace-store] persist setItem error", e);
    }
  },

  /**
   * No need for this in our case
   */
  removeItem: () => {},
};
