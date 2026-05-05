import { WorkspaceInfo } from "@shared/ipc";
import type { StateCreator } from "zustand";
import "zustand/middleware/immer";

export type TabType = "chat" | "empty";

export interface EmptyTab {
  type: "empty";
}

export interface ChatTab {
  type: "chat";
  chatId: string;
}

export type TabContent = EmptyTab | ChatTab;

export type Tab = {
  id: string;

  isDirty?: boolean;
} & TabContent;

export type WorkspaceState = "idle" | "loading";

export interface WorkspaceSliceValue {
  state: WorkspaceState;
  workspace: WorkspaceInfo | null;
}

export interface WorkspaceSlice extends WorkspaceSliceValue {
  switchWorkspace: (id: string) => Promise<void>;
}

export interface TabsSliceValue {
  tabs: Tab[];
  activeTabId: string | null;
}

export interface TabsSlice extends TabsSliceValue {
  openTab: (content: TabContent, opts?: { mode: "auto" | "new-tab" }) => void;
  closeTab: (tabId: string) => void;
  removeTabsByChatIds: (chatIds: readonly string[]) => void;

  setActiveTab: (tabId: string) => void;

  activeTab: () => Tab | null;
}

export interface TreeSliceValue {
  expandedTreeNodes: string[];
}

export interface TreeSlice extends TreeSliceValue {
  toggleNode: (nodeId: string) => void;
  setExpandedNodes: (nodes: string[]) => void;
  removeExpandedNodes: (nodes: readonly string[]) => void;

  collapseAll: () => void;
}

export type WorkspaceStoreValues = WorkspaceSliceValue & TabsSliceValue & TreeSliceValue;

export type WorkspaceStoreState = WorkspaceSlice & TabsSlice & TreeSlice;

export type WorkspaceStoreMutators = [["zustand/immer", never]];

export type WorkspaceSliceCreator<T> = StateCreator<
  WorkspaceStoreState,
  WorkspaceStoreMutators,
  [],
  T
>;
