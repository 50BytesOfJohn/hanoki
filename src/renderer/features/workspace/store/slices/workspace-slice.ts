import { syncWorkspaceSettingsStateToSqlite } from "../storage/sqlite-storage";
import type { WorkspaceSlice, WorkspaceSliceCreator } from "../types";
import { workspaceApi } from "@/api/workspaces";
import { parseTiptapDocument } from "@shared/tiptap/document";

export const createWorkspaceSlice: WorkspaceSliceCreator<WorkspaceSlice> = (set) => ({
  state: "idle",
  workspace: null,
  currentChatId: null,
  sidebarViewMode: null,
  chatDrafts: {},
  chatViews: {},

  setCurrentChat: (chatId) => {
    set((state) => {
      state.currentChatId = chatId;
    });
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

  setChatView: (chatId, view) => {
    set((state) => {
      // "/chat" is the default view — no need to store it.
      if (view === "/chat") {
        delete state.chatViews[chatId];
      } else {
        state.chatViews[chatId] = view;
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
    syncWorkspaceSettingsStateToSqlite.flush();

    /**
     * Now we need will set new workspace as active,
     * which will give us it's settings in response as well
     */
    const { settings: newSettings = {}, ...newWorkspace } =
      await workspaceApi.setActive(newWorkspaceId);

    set((state) => {
      state.state = "idle";

      state.workspace = newWorkspace;

      state.currentChatId = newSettings.currentChatId ?? null;
      state.tabs =
        newSettings.tabs?.map((t) => ({
          id: t.id,
          type: "chat",
          chatId: t.chatId,
        })) ?? [];

      state.expandedTreeNodes = newSettings.chatTreeExpandedFolderIds ?? [];
      state.sidebarViewMode = newSettings.sidebarViewMode ?? null;
      state.chatDrafts = newSettings.chatDrafts ?? {};
      state.chatViews = newSettings.chatViews ?? {};
    });

    /**
     * The state save will be triggered but it's not a problem for us anyways
     */
  },
});
