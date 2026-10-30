import type {
  ChatPaneView,
  ChatSidebarViewMode,
  ItemType,
  TabStateItem,
  WorkspaceInfo,
} from "@shared/ipc";
import type { StateCreator } from "zustand";
import "zustand/middleware/immer";
import type { TiptapDocument } from "@shared/tiptap/document";

export type TabContent = { type: ItemType; itemId: string };
export type Tab = TabStateItem;

export type WorkspaceState = "idle" | "loading";

export interface WorkspaceSliceValue {
  state: WorkspaceState;
  workspace: WorkspaceInfo | null;
  activeTabId: string | null;
  /** Derived mirror of the active tab's focused pane, used by chat runtime consumers. */
  currentChatId: string | null;
  /** Per-workspace override of the global sidebar view mode; null = use global default. */
  sidebarViewMode: ChatSidebarViewMode | null;
  /** Unsent composer documents per chat id. Strings are legacy drafts. */
  chatDrafts: Record<string, TiptapDocument | string>;
}

export interface WorkspaceSlice extends WorkspaceSliceValue {
  switchWorkspace: (id: string) => Promise<void>;
  setSidebarViewMode: (mode: ChatSidebarViewMode) => void;
  setChatDraft: (chatId: string, draft: TiptapDocument) => void;
}

export interface TabsSliceValue {
  tabs: Tab[];
}

export type OpenTabOptions = {
  /** When false, adds the tab without switching to it. Defaults to true. */
  activate?: boolean;
};

export type OpenItemOptions = {
  /** Never reuse the focused pane, even when the user's open behavior says "current-tab". */
  newTab?: boolean;
};

/** A closed tab and where it stood, so reopening puts it back in place. */
export type ClosedTab = { tab: Tab; index: number };

export interface TabsSlice extends TabsSliceValue {
  /** Tab ids, most recently active first. Session-only, like `closedTabs`. */
  tabHistory: string[];
  closedTabs: ClosedTab[];
  /** Default "open this" intent: goes to an already open item, else follows the user's setting. */
  openItem: (itemId: string, itemType: ItemType, options?: OpenItemOptions) => void;
  /** Explicit "keep this" intent: opens the item in a tab of its own and never as a preview. */
  openTab: (content: TabContent, options?: OpenTabOptions) => void;
  keepTab: (tabId: string) => void;
  keepItem: (itemId: string) => void;
  reopenClosedTab: () => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToLeft: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  closeAllTabs: () => void;
  moveTab: (tabId: string, toIndex: number) => void;
  selectTab: (tabId: string) => void;
  openItemInFocusedPane: (itemId: string, itemType: ItemType) => void;
  focusPane: (tabId: string, paneId: string) => void;
  setPaneView: (tabId: string, paneId: string, view: ChatPaneView, graphMessageId?: string) => void;
  splitPane: (
    tabId: string,
    paneId: string,
    itemId: string,
    itemType: ItemType,
    direction: "left" | "right" | "top" | "bottom",
  ) => void;
  movePane: (
    tabId: string,
    sourcePaneId: string,
    targetPaneId: string,
    position: "center" | "left" | "right" | "top" | "bottom",
  ) => void;
  closePane: (tabId: string, paneId: string) => void;
  resizeSplit: (tabId: string, splitId: string, sizes: Record<string, number>) => void;
  focusAdjacentPane: (direction: "left" | "right" | "up" | "down") => void;
  removeTabsByItemIds: (itemIds: readonly string[]) => void;
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
