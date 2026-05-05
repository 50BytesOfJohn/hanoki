import { workspaceApi } from "@/api/workspaces";
import type { PersistStorage } from "zustand/middleware";
import type { WorkspaceStoreValues } from "../types";
import { AsyncDebouncer } from "@tanstack/react-pacer";

export const syncWorkspaceSettingsStateToSqlite = new AsyncDebouncer(
  async (state: WorkspaceStoreValues) => {
    if (!state.workspace) return;

    await workspaceApi.updateSettings(state.workspace.id, {
      activeTabId: state.activeTabId,
      tabs: state.tabs
        .filter((t) => t.chatId)
        .map((t) => ({
          chatId: t.chatId!,
          id: t.id,
          type: "chat",
        })),

      chatTreeExpandedFolderIds: state.expandedTreeNodes,
    });
  },
  {
    wait: 5_000,

    onSuccess: () => {
      console.info("[workspace-store] Settings Sync Completed");
    },

    onError: (error) => {
      console.error("[workspace-store] Sync Settings Error", error);
    },
  },
);

export const sqliteStorage: PersistStorage<WorkspaceStoreValues> = {
  getItem: async (_name: string) => {
    console.info("[workspace-store] Storage Get Item");
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

      console.info("[workspace-store] Storage Active Workspace", workspace, settings);

      /**
       * No active workspace should never happen
       */
      if (!workspace) return null;

      return {
        state: {
          state: "idle",
          workspace,

          // TABS
          activeTabId: settings?.activeTabId ?? settings?.tabs?.[0]?.id ?? null,
          tabs:
            settings?.tabs?.map((t) => ({
              id: t.id,
              type: "chat",
              chatId: t.chatId,
              title: t.id,
              isDirty: true,
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
