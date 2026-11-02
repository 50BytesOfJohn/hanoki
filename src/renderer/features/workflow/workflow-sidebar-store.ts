import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkflowSidebarPreferences {
  /** The card shows only its header. */
  collapsed: boolean;
  /** Out of the chat's side; a button brings it back, as in a narrow pane. */
  hidden: boolean;
  setCollapsed: (collapsed: boolean) => void;
  setHidden: (hidden: boolean) => void;
}

/** App-wide, like the window's own sidebars: it's how you like the chat laid out. */
export const useWorkflowSidebarPreferences = create<WorkflowSidebarPreferences>()(
  persist(
    (set) => ({
      collapsed: false,
      hidden: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      setHidden: (hidden) => set({ hidden }),
    }),
    {
      name: "workflow-sidebar-preferences",
      version: 1,
      partialize: ({ collapsed, hidden }) => ({ collapsed, hidden }),
    },
  ),
);
