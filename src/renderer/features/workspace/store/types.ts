import { ChatSidebarViewMode, WorkspaceInfo } from "@shared/ipc";
import type { StateCreator } from "zustand";
import "zustand/middleware/immer";
import type { TiptapDocument } from "@shared/tiptap/document";

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
  /** Unsent composer documents per chat id. Strings are legacy drafts. */
  chatDrafts: Record<string, TiptapDocument | string>;
  /** Last-used chat panel view (route path) per chat id; absent = conversation. */
  chatViews: Record<string, string>;
}

export interface WorkspaceSlice extends WorkspaceSliceValue {
  switchWorkspace: (id: string) => Promise<void>;
  setCurrentChat: (chatId: string | null) => void;
  setSidebarViewMode: (mode: ChatSidebarViewMode) => void;
  setChatDraft: (chatId: string, draft: TiptapDocument) => void;
  setChatView: (chatId: string, view: string) => void;
}

export interface TabsSliceValue {
  tabs: Tab[];
}

export type OpenTabOptions = {
  /** When false, adds the tab without switching to it. Defaults to true. */
  activate?: boolean;
};

export interface TabsSlice extends TabsSliceValue {
  openTab: (content: TabContent, options?: OpenTabOptions) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToLeft: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  closeAllTabs: () => void;
  moveTab: (tabId: string, toIndex: number) => void;
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
