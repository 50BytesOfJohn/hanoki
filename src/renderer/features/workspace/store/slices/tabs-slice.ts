import type {
  OpenItemOptions,
  OpenTabOptions,
  Tab,
  TabContent,
  TabsSlice,
  WorkspaceSliceCreator,
  WorkspaceStoreState,
} from "../types";
import {
  createItemPane,
  createItemTab,
  findPane,
  findPaneByItemId,
  getFocusedPane,
  getPanes,
  insertPane,
  movePane as movePaneInLayout,
  normalizeTab,
  removeItems,
  removePane,
  replacePaneItem,
  resizeSplit as resizeSplitInLayout,
  updatePane,
} from "../layout-tree";
import { getTabPreferences } from "../tab-preferences";

const MAX_CLOSED_TABS = 20;

const paneChatId = (pane: ReturnType<typeof getFocusedPane>) =>
  pane.itemType === "chat" ? pane.itemId : null;

function activateTab(state: WorkspaceStoreState, tab: Tab) {
  state.activeTabId = tab.id;
  state.currentChatId = paneChatId(getFocusedPane(tab));
  if (state.tabHistory[0] !== tab.id) {
    state.tabHistory = [tab.id, ...state.tabHistory.filter((id) => id !== tab.id)];
  }
}

function insertTab(state: WorkspaceStoreState, tab: Tab) {
  const activeIndex = state.tabs.findIndex((candidate) => candidate.id === state.activeTabId);
  const atEnd = getTabPreferences().tabInsertPosition === "end" || activeIndex === -1;
  state.tabs.splice(atEnd ? state.tabs.length : activeIndex + 1, 0, tab);
}

/** Finds the item in any tab, preferring the active one so splits aren't left needlessly. */
function findOpenItem(state: WorkspaceStoreState, itemId: string) {
  const ordered = [...state.tabs].sort(
    (a, b) => Number(b.id === state.activeTabId) - Number(a.id === state.activeTabId),
  );
  for (const tab of ordered) {
    const pane = findPaneByItemId(tab.layout, itemId);
    if (pane) return { tab, pane };
  }
  return null;
}

/** The tab that takes over from a closing active tab, chosen among the tabs that survive. */
function pickNextTab(state: WorkspaceStoreState, closing: ReadonlySet<string>): Tab | null {
  const remaining = state.tabs.filter((tab) => !closing.has(tab.id));
  if (getTabPreferences().tabCloseFocus === "recent") {
    const recentId = state.tabHistory.find((id) => !closing.has(id));
    const recent = remaining.find((tab) => tab.id === recentId);
    if (recent) return recent;
  }
  const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
  const after = state.tabs.slice(activeIndex + 1).find((tab) => !closing.has(tab.id));
  return after ?? remaining[remaining.length - 1] ?? null;
}

function dropTabs(
  state: WorkspaceStoreState,
  tabIds: Iterable<string>,
  { remember }: { remember: boolean },
) {
  const closing = new Set(tabIds);
  if (closing.size === 0) return;
  const next =
    state.activeTabId && closing.has(state.activeTabId) ? pickNextTab(state, closing) : undefined;

  if (remember) {
    state.tabs.forEach((tab, index) => {
      if (closing.has(tab.id)) state.closedTabs.push({ tab, index });
    });
    state.closedTabs = state.closedTabs.slice(-MAX_CLOSED_TABS);
  }
  state.tabs = state.tabs.filter((tab) => !closing.has(tab.id));
  state.tabHistory = state.tabHistory.filter((id) => !closing.has(id));

  if (next) activateTab(state, next);
  else if (next === null) {
    state.activeTabId = null;
    state.currentChatId = null;
  }
}

export const createTabsSlice: WorkspaceSliceCreator<TabsSlice> = (set) => ({
  tabs: [],
  tabHistory: [],
  closedTabs: [],

  openItem: (itemId, itemType, options?: OpenItemOptions) => {
    set((state) => {
      const existing = findOpenItem(state, itemId);
      if (existing) {
        existing.tab.focusedPaneId = existing.pane.id;
        activateTab(state, existing.tab);
        return;
      }

      const { tabOpenBehavior } = getTabPreferences();
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (tabOpenBehavior === "current-tab" && activeTab && !options?.newTab) {
        activeTab.layout = replacePaneItem(
          activeTab.layout,
          activeTab.focusedPaneId,
          itemId,
          itemType,
        );
        activateTab(state, activeTab);
        return;
      }

      // Replacing a terminal's tab would kill a running shell, so terminals always stay.
      const asPreview = tabOpenBehavior === "preview" && itemType !== "terminal";
      const previewTab = asPreview ? state.tabs.find((tab) => tab.preview) : undefined;
      if (previewTab) {
        previewTab.layout = replacePaneItem(
          previewTab.layout,
          previewTab.focusedPaneId,
          itemId,
          itemType,
        );
        activateTab(state, previewTab);
        return;
      }

      const newTab = createItemTab(itemId, itemType);
      if (asPreview) newTab.preview = true;
      insertTab(state, newTab);
      activateTab(state, newTab);
    });
  },

  openTab: (content: TabContent, options?: OpenTabOptions) => {
    const activate = options?.activate ?? true;
    set((state) => {
      const existing = findOpenItem(state, content.itemId);
      if (existing) {
        delete existing.tab.preview;
        if (activate) {
          existing.tab.focusedPaneId = existing.pane.id;
          activateTab(state, existing.tab);
        }
        return;
      }

      const newTab = createItemTab(content.itemId, content.type);
      insertTab(state, newTab);
      if (activate) activateTab(state, newTab);
    });
  },

  keepTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (tab) delete tab.preview;
    });
  },

  keepItem: (itemId) => {
    set((state) => {
      const tab = state.tabs.find(
        (candidate) => candidate.preview && findPaneByItemId(candidate.layout, itemId),
      );
      if (tab) delete tab.preview;
    });
  },

  reopenClosedTab: () => {
    set((state) => {
      const openItemIds = new Set(
        state.tabs.flatMap((tab) => getPanes(tab.layout).map((pane) => pane.itemId)),
      );
      // Skip entries whose items have all been opened again since they were closed.
      while (state.closedTabs.length > 0) {
        const { tab, index } = state.closedTabs.pop()!;
        const layout = removeItems(tab.layout, openItemIds);
        const restored = layout ? normalizeTab({ ...tab, layout, preview: undefined }) : null;
        if (!restored) continue;
        state.tabs.splice(Math.min(index, state.tabs.length), 0, restored);
        activateTab(state, restored);
        return;
      }
    });
  },

  selectTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (tab) activateTab(state, tab);
    });
  },

  openItemInFocusedPane: (itemId, itemType) => {
    set((state) => {
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!activeTab) {
        const newTab = createItemTab(itemId, itemType);
        state.tabs.push(newTab);
        activateTab(state, newTab);
        return;
      }

      const existingPane = findPaneByItemId(activeTab.layout, itemId);
      if (existingPane) {
        activeTab.focusedPaneId = existingPane.id;
      } else {
        activeTab.layout = replacePaneItem(
          activeTab.layout,
          activeTab.focusedPaneId,
          itemId,
          itemType,
        );
      }
      activateTab(state, activeTab);
    });
  },

  focusPane: (tabId, paneId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || !findPane(tab.layout, paneId)) return;
      tab.focusedPaneId = paneId;
      activateTab(state, tab);
    });
  },

  setPaneView: (tabId, paneId, view, graphMessageId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || !findPane(tab.layout, paneId)) return;
      tab.layout = updatePane(tab.layout, paneId, {
        view,
        graphMessageId: view === "/chat/graph" ? graphMessageId : undefined,
      });
      tab.focusedPaneId = paneId;
      activateTab(state, tab);
    });
  },

  splitPane: (tabId, paneId, itemId, itemType, direction) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || !findPane(tab.layout, paneId)) return;
      const existingPane = findPaneByItemId(tab.layout, itemId);
      if (existingPane) {
        tab.focusedPaneId = existingPane.id;
        state.currentChatId = paneChatId(existingPane);
        return;
      }
      const pane = createItemPane(itemId, itemType);
      tab.layout = insertPane(tab.layout, paneId, pane, direction);
      tab.focusedPaneId = pane.id;
      delete tab.preview;
      activateTab(state, tab);
    });
  },

  movePane: (tabId, sourcePaneId, targetPaneId, position) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;
      const source = findPane(tab.layout, sourcePaneId);
      if (!source || !findPane(tab.layout, targetPaneId)) return;
      tab.layout = movePaneInLayout(tab.layout, sourcePaneId, targetPaneId, position);
      tab.focusedPaneId = sourcePaneId;
      activateTab(state, tab);
    });
  },

  closePane: (tabId, paneId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;
      const panes = getPanes(tab.layout);
      const closedIndex = panes.findIndex((pane) => pane.id === paneId);
      if (closedIndex === -1) return;

      const nextLayout = removePane(tab.layout, paneId);
      if (!nextLayout) {
        dropTabs(state, [tabId], { remember: true });
        return;
      }

      tab.layout = nextLayout;
      const nextPanes = getPanes(nextLayout);
      const neighbor = nextPanes[Math.min(closedIndex, nextPanes.length - 1)];
      if (tab.focusedPaneId === paneId || !findPane(nextLayout, tab.focusedPaneId)) {
        tab.focusedPaneId = neighbor.id;
      }
      if (state.activeTabId === tabId) {
        state.currentChatId = paneChatId(getFocusedPane(tab));
      }
    });
  },

  resizeSplit: (tabId, splitId, sizes) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (tab) tab.layout = resizeSplitInLayout(tab.layout, splitId, sizes);
    });
  },

  focusAdjacentPane: (direction) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
      if (!tab) return;
      const panes = getPanes(tab.layout);
      const currentIndex = panes.findIndex((pane) => pane.id === tab.focusedPaneId);
      const delta = direction === "left" || direction === "up" ? -1 : 1;
      const next = panes[(currentIndex + delta + panes.length) % panes.length];
      tab.focusedPaneId = next.id;
      state.currentChatId = paneChatId(next);
    });
  },

  closeTab: (tabId) => {
    set((state) => {
      if (state.tabs.some((tab) => tab.id === tabId)) {
        dropTabs(state, [tabId], { remember: true });
      }
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const keptTab = state.tabs.find((tab) => tab.id === tabId);
      if (!keptTab) return;
      dropTabs(
        state,
        state.tabs.filter((tab) => tab.id !== tabId).map((tab) => tab.id),
        { remember: true },
      );
      activateTab(state, keptTab);
    });
  },

  closeTabsToLeft: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex <= 0) return;
      dropTabs(
        state,
        state.tabs.slice(0, tabIndex).map((tab) => tab.id),
        { remember: true },
      );
    });
  },

  closeTabsToRight: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) return;
      dropTabs(
        state,
        state.tabs.slice(tabIndex + 1).map((tab) => tab.id),
        { remember: true },
      );
    });
  },

  moveTab: (tabId, toIndex) => {
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (fromIndex === -1 || fromIndex === toIndex) return;
      const [tab] = state.tabs.splice(fromIndex, 1);
      // Placing a tab somewhere on purpose means wanting it to stay there.
      delete tab.preview;
      state.tabs.splice(toIndex, 0, tab);
    });
  },

  closeAllTabs: () => {
    set((state) => {
      dropTabs(
        state,
        state.tabs.map((tab) => tab.id),
        { remember: true },
      );
    });
  },

  removeTabsByItemIds: (itemIds) => {
    if (itemIds.length === 0) return;
    const deletedItemIds = new Set(itemIds);
    set((state) => {
      for (const itemId of deletedItemIds) delete state.chatDrafts[itemId];

      state.closedTabs = state.closedTabs.flatMap(({ tab, index }) => {
        const layout = removeItems(tab.layout, deletedItemIds);
        const restored = layout ? normalizeTab({ ...tab, layout }) : null;
        return restored ? [{ tab: restored, index }] : [];
      });

      const emptied: string[] = [];
      for (const tab of state.tabs) {
        const layout = removeItems(tab.layout, deletedItemIds);
        if (!layout) {
          emptied.push(tab.id);
          continue;
        }
        tab.layout = layout;
        if (!findPane(layout, tab.focusedPaneId)) tab.focusedPaneId = getPanes(layout)[0].id;
      }
      dropTabs(state, emptied, { remember: false });

      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      state.currentChatId = activeTab ? paneChatId(getFocusedPane(activeTab)) : null;
    });
  },
});
