import {
  normalizePersistedTabs,
  syncWorkspaceSettingsStateToSqlite,
} from "../storage/sqlite-storage";
import type { WorkspaceSlice, WorkspaceSliceCreator } from "../types";
import { workspaceApi } from "@/api/workspaces";
import { parseTiptapDocument } from "@shared/tiptap/document";
import { getFocusedPane } from "../layout-tree";

export const createWorkspaceSlice: WorkspaceSliceCreator<WorkspaceSlice> = (set, get) => ({
  state: "idle",
  workspace: null,
  activeTabId: null,
  currentChatId: null,
  sidebarViewMode: null,
  chatDrafts: {},

  setCurrentChat: (chatId) => {
    if (chatId === null) {
      set((state) => {
        state.currentChatId = null;
      });
      return;
    }
    get().openChatInFocusedPane(chatId);
  },

  setChatDraft: (chatId, draft) => {
    set((state) => {
      const parsed = parseTiptapDocument(draft);
      if (parsed.ok && parsed.value.displayText.trim()) {
        state.chatDrafts[chatId] = draft;
      } else {
        delete state.chatDrafts[chatId];
      }
    });
  },

  setSidebarViewMode: (mode) => {
    set((state) => {
      state.sidebarViewMode = mode;
    });
  },

  switchWorkspace: async (newWorkspaceId: string) => {
    // This is okey as it will still trigger debounce with old workspace ID
    set((state) => {
      state.state = "loading";
    });

    /**
     * On workspace switch we need to flush the syncWorkspaceSettings first,
     * to avoid sync data loss
     */
    await syncWorkspaceSettingsStateToSqlite.flush();

    /**
     * Now we need will set new workspace as active,
     * which will give us it's settings in response as well
     */
    const { settings: newSettings = {}, ...newWorkspace } =
      await workspaceApi.setActive(newWorkspaceId);
    const normalizedTabs = await normalizePersistedTabs(newSettings.tabs, newWorkspace.id);

    set((state) => {
      state.state = "idle";

      state.workspace = newWorkspace;

      state.tabs = normalizedTabs;
      state.activeTabId = state.tabs.some((tab) => tab.id === newSettings.activeTabId)
        ? (newSettings.activeTabId ?? null)
        : (state.tabs[0]?.id ?? null);
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      state.currentChatId = activeTab ? getFocusedPane(activeTab).chatId : null;

      state.expandedTreeNodes = newSettings.chatTreeExpandedFolderIds ?? [];
      state.sidebarViewMode = newSettings.sidebarViewMode ?? null;
      state.chatDrafts = newSettings.chatDrafts ?? {};
    });

    /**
     * The state save will be triggered but it's not a problem for us anyways
     */
  },
});
