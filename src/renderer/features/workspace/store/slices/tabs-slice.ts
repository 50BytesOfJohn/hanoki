import type { OpenTabOptions, TabContent, TabsSlice, WorkspaceSliceCreator } from "../types";
import {
  createItemPane,
  createItemTab,
  findPane,
  findPaneByItemId,
  getFocusedPane,
  getPanes,
  insertPane,
  movePane as movePaneInLayout,
  removeItems,
  removePane,
  replacePaneItem,
  resizeSplit as resizeSplitInLayout,
  updatePane,
} from "../layout-tree";

const paneChatId = (pane: ReturnType<typeof getFocusedPane>) =>
  pane.itemType === "chat" ? pane.itemId : null;

export const createTabsSlice: WorkspaceSliceCreator<TabsSlice> = (set) => ({
  tabs: [],

  openTab: (content: TabContent, options?: OpenTabOptions) => {
    const activate = options?.activate ?? true;
    set((state) => {
      const existing = state.tabs
        .map((tab) => ({ tab, pane: findPaneByItemId(tab.layout, content.itemId) }))
        .find((entry) => entry.pane);
      if (existing?.pane) {
        if (activate) {
          existing.tab.focusedPaneId = existing.pane.id;
          state.activeTabId = existing.tab.id;
          state.currentChatId = paneChatId(existing.pane);
        }
        return;
      }

      const newTab = createItemTab(content.itemId, content.type);
      state.tabs.push(newTab);
      if (activate) {
        state.activeTabId = newTab.id;
        state.currentChatId = content.type === "chat" ? content.itemId : null;
      }
    });
  },

  selectTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;
      state.activeTabId = tab.id;
      state.currentChatId = paneChatId(getFocusedPane(tab));
    });
  },

  openItemInFocusedPane: (itemId, itemType) => {
    set((state) => {
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!activeTab) {
        const newTab = createItemTab(itemId, itemType);
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
        state.currentChatId = itemType === "chat" ? itemId : null;
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
      state.currentChatId = itemType === "chat" ? itemId : null;
    });
  },

  focusPane: (tabId, paneId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      const pane = tab ? findPane(tab.layout, paneId) : null;
      if (!tab || !pane) return;
      tab.focusedPaneId = paneId;
      state.activeTabId = tabId;
      state.currentChatId = paneChatId(pane);
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
      state.activeTabId = tabId;
      const pane = findPane(tab.layout, paneId);
      state.currentChatId = pane ? paneChatId(pane) : state.currentChatId;
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
      state.activeTabId = tab.id;
      state.currentChatId = itemType === "chat" ? itemId : null;
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
      state.activeTabId = tab.id;
      state.currentChatId = paneChatId(source);
    });
  },

  closePane: (tabId, paneId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((candidate) => candidate.id === tabId);
      if (tabIndex === -1) return;
      const tab = state.tabs[tabIndex];
      const panes = getPanes(tab.layout);
      const closedIndex = panes.findIndex((pane) => pane.id === paneId);
      if (closedIndex === -1) return;

      const nextLayout = removePane(tab.layout, paneId);
      if (!nextLayout) {
        state.tabs.splice(tabIndex, 1);
        if (state.activeTabId === tabId) {
          const neighbor = state.tabs[tabIndex] ?? state.tabs[tabIndex - 1];
          state.activeTabId = neighbor?.id ?? null;
          state.currentChatId = neighbor ? paneChatId(getFocusedPane(neighbor)) : null;
        }
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
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) return;
      state.tabs.splice(tabIndex, 1);
      if (state.activeTabId === tabId) {
        const neighbor = state.tabs[tabIndex] ?? state.tabs[tabIndex - 1];
        state.activeTabId = neighbor?.id ?? null;
        state.currentChatId = neighbor ? paneChatId(getFocusedPane(neighbor)) : null;
      }
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const keptTab = state.tabs.find((tab) => tab.id === tabId);
      if (!keptTab || state.tabs.length < 2) return;
      state.tabs = [keptTab];
      state.activeTabId = keptTab.id;
      state.currentChatId = paneChatId(getFocusedPane(keptTab));
    });
  },

  closeTabsToLeft: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex <= 0) return;
      const keptTabs = state.tabs.slice(tabIndex);
      state.tabs = keptTabs;
      if (!keptTabs.some((tab) => tab.id === state.activeTabId)) {
        state.activeTabId = keptTabs[0].id;
        state.currentChatId = paneChatId(getFocusedPane(keptTabs[0]));
      }
    });
  },

  closeTabsToRight: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1 || tabIndex >= state.tabs.length - 1) return;
      const keptTabs = state.tabs.slice(0, tabIndex + 1);
      state.tabs = keptTabs;
      if (!keptTabs.some((tab) => tab.id === state.activeTabId)) {
        const neighbor = keptTabs[keptTabs.length - 1];
        state.activeTabId = neighbor.id;
        state.currentChatId = paneChatId(getFocusedPane(neighbor));
      }
    });
  },

  moveTab: (tabId, toIndex) => {
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (fromIndex === -1 || fromIndex === toIndex) return;
      const [tab] = state.tabs.splice(fromIndex, 1);
      state.tabs.splice(toIndex, 0, tab);
    });
  },

  closeAllTabs: () => {
    set((state) => {
      state.tabs = [];
      state.activeTabId = null;
      state.currentChatId = null;
    });
  },

  removeTabsByItemIds: (itemIds) => {
    if (itemIds.length === 0) return;
    const deletedItemIds = new Set(itemIds);
    set((state) => {
      for (const itemId of deletedItemIds) delete state.chatDrafts[itemId];

      state.tabs = state.tabs.flatMap((tab) => {
        const layout = removeItems(tab.layout, deletedItemIds);
        if (!layout) return [];
        const panes = getPanes(layout);
        return [
          {
            ...tab,
            layout,
            focusedPaneId: panes.some((pane) => pane.id === tab.focusedPaneId)
              ? tab.focusedPaneId
              : panes[0].id,
          },
        ];
      });

      let activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!activeTab) {
        activeTab = state.tabs[0];
        state.activeTabId = activeTab?.id ?? null;
      }
      state.currentChatId = activeTab ? paneChatId(getFocusedPane(activeTab)) : null;
    });
  },
});
