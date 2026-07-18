import { ChatSidebarViewMode, WorkspaceInfo } from "@shared/ipc";
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
  /** Per-workspace override of the global sidebar view mode; null = use global default. */
  sidebarViewMode: ChatSidebarViewMode | null;
  /** Unsent composer text per chat id. */
  chatDrafts: Record<string, string>;
  /** Last-used chat panel view (route path) per chat id; absent = conversation. */
  chatViews: Record<string, string>;
}

export interface WorkspaceSlice extends WorkspaceSliceValue {
  switchWorkspace: (id: string) => Promise<void>;
  setCurrentChat: (chatId: string | null) => void;
  setSidebarViewMode: (mode: ChatSidebarViewMode) => void;
  setChatDraft: (chatId: string, draft: string) => void;
  setChatView: (chatId: string, view: string) => void;
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
