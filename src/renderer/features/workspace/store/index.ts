import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer"; // v5 immer middleware
import { createWorkspaceSlice } from "./slices/workspace-slice";
import { createTabsSlice } from "./slices/tabs-slice";
import { createTreeSlice } from "./slices/tree-slice";

import type { WorkspaceStoreState, WorkspaceStoreValues } from "./types";
import { sqliteStorage } from "./storage/sqlite-storage";

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
    subscribeWithSelector(
      persist(
        immer((...a) => ({
          ...createWorkspaceSlice(...a),
          ...createTabsSlice(...a),
          ...createTreeSlice(...a),
        })),
        {
          name: "workspace-store-storage",
          storage: sqliteStorage,

          partialize: (state) =>
            ({
              state: state.state,
              workspace: state.workspace,

              activeTabId: state.activeTabId,
              currentChatId: state.currentChatId,
              sidebarViewMode: state.sidebarViewMode,
              chatDrafts: state.chatDrafts,
              tabs: state.tabs,

              expandedTreeNodes: state.expandedTreeNodes,
            }) satisfies WorkspaceStoreValues,
        },
      ),
    ),
  ),
);

function subscribeToHydration(onChange: () => void) {
  return useWorkspaceStore.persist.onFinishHydration(onChange);
}

/** False until the persisted workspace has loaded, when empty tabs don't yet mean "no tabs". */
export function useIsWorkspaceHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, useWorkspaceStore.persist.hasHydrated);
}
