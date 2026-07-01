import { WorkspaceInfo } from "@shared/ipc";
import type { StateCreator } from "zustand";
import "zustand/middleware/immer";

export type TabType = "chat";

export interface ChatTab {
  type: "chat";
  chatId: string;
}

export type TabContent = ChatTab;

export type Tab = {
  id: string;
} & TabContent;

export type WorkspaceState = "idle" | "loading";

export interface WorkspaceSliceValue {
  state: WorkspaceState;
  workspace: WorkspaceInfo | null;
  currentChatId: string | null;
}

export interface WorkspaceSlice extends WorkspaceSliceValue {
  switchWorkspace: (id: string) => Promise<void>;
  setCurrentChat: (chatId: string | null) => void;
}

export interface TabsSliceValue {
  tabs: Tab[];
}

export interface TabsSlice extends TabsSliceValue {
  openTab: (content: TabContent) => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  removeTabsByChatIds: (chatIds: readonly string[]) => void;
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
