import { workspaceApi } from "@/api/workspaces";
import { chatsApi } from "@/api/chats";
import type { PersistStorage } from "zustand/middleware";
import type { WorkspaceStoreValues } from "../types";
import { AsyncDebouncer } from "@tanstack/react-pacer";
import type { TabStateItem } from "@shared/ipc";
import { getFocusedPane, getPanes, normalizeTab, removeChats } from "../layout-tree";

export async function normalizePersistedTabs(
  tabs: readonly TabStateItem[] | undefined,
  workspaceId: string,
): Promise<TabStateItem[]> {
  const normalized = tabs?.map(normalizeTab).filter((tab) => tab !== null) ?? [];
  const chatIds = [
    ...new Set(normalized.flatMap((tab) => getPanes(tab.layout).map((pane) => pane.chatId))),
  ];
  const chatResults = await Promise.allSettled(chatIds.map((chatId) => chatsApi.get(chatId)));
  const unavailableChatIds = new Set(
    chatIds.filter((chatId, index) => {
      const result = chatResults[index];
      return result.status === "rejected" || result.value.workspaceId !== workspaceId;
    }),
  );
  return normalized.flatMap((tab) => {
    const layout = removeChats(tab.layout, unavailableChatIds);
    if (!layout) return [];
    return [normalizeTab({ ...tab, layout })].filter((item) => item !== null);
  });
}

export const syncWorkspaceSettingsStateToSqlite = new AsyncDebouncer(
  async (state: WorkspaceStoreValues) => {
    if (!state.workspace) return;

    await workspaceApi.updateSettings(state.workspace.id, {
      activeTabId: state.activeTabId,
      tabs: state.tabs,

      chatTreeExpandedFolderIds: state.expandedTreeNodes,
      chatDrafts: state.chatDrafts,

      // ponytail: null = no override; skip the key so the stored value survives
      ...(state.sidebarViewMode ? { sidebarViewMode: state.sidebarViewMode } : {}),
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

/**
 * Flush any pending debounced sync on quit so recent state (drafts and tab layouts)
 * isn't lost to the 5s debounce window.
 */
window.addEventListener("beforeunload", () => {
  void syncWorkspaceSettingsStateToSqlite.flush();
});

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

      const tabs = await normalizePersistedTabs(settings?.tabs, workspace.id);
      const activeTabId = tabs.some((tab) => tab.id === settings?.activeTabId)
        ? (settings?.activeTabId ?? null)
        : (tabs[0]?.id ?? null);
      const activeTab = tabs.find((tab) => tab.id === activeTabId);

      return {
        state: {
          state: "idle",
          workspace,

          // CURRENT CHAT + TABS
          activeTabId,
          currentChatId: activeTab ? getFocusedPane(activeTab).chatId : null,
          tabs,

          expandedTreeNodes: settings?.chatTreeExpandedFolderIds ?? [],
          sidebarViewMode: settings?.sidebarViewMode ?? null,
          chatDrafts: settings?.chatDrafts ?? {},
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
