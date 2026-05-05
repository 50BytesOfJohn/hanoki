import { syncWorkspaceSettingsStateToSqlite } from "../storage/sqlite-storage";
import type { WorkspaceSlice, WorkspaceSliceCreator } from "../types";
import { workspaceApi } from "@/api/workspaces";

export const createWorkspaceSlice: WorkspaceSliceCreator<WorkspaceSlice> = (set) => ({
  state: "idle",
  workspace: null,

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

      state.activeTabId = newSettings.activeTabId ?? newSettings.tabs?.[0]?.id ?? null;
      state.tabs =
        newSettings.tabs?.map((t) => ({
          id: t.id,
          type: "chat",
          chatId: t.chatId,
          title: t.chatId,
          isDirty: true,
        })) ?? [];

      state.expandedTreeNodes = newSettings.chatTreeExpandedFolderIds ?? [];
    });

    /**
     * The state save will be triggered but it's not a problem for us anyways
     */
  },
});
