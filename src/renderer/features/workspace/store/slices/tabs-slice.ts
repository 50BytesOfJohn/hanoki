import type { OpenTabOptions, TabContent, TabsSlice, WorkspaceSliceCreator } from "../types";
import {
  createChatPane,
  createChatTab,
  findPane,
  findPaneByChatId,
  getFocusedPane,
  getPanes,
  insertPane,
  movePane as movePaneInLayout,
  removeChats,
  removePane,
  replacePaneChat,
  resizeSplit as resizeSplitInLayout,
  updatePane,
} from "../layout-tree";

export const createTabsSlice: WorkspaceSliceCreator<TabsSlice> = (set) => ({
  tabs: [],

  openTab: (content: TabContent, options?: OpenTabOptions) => {
    const activate = options?.activate ?? true;
    set((state) => {
      const existing = state.tabs
        .map((tab) => ({ tab, pane: findPaneByChatId(tab.layout, content.chatId) }))
        .find((entry) => entry.pane);
      if (existing?.pane) {
        if (activate) {
          existing.tab.focusedPaneId = existing.pane.id;
          state.activeTabId = existing.tab.id;
          state.currentChatId = existing.pane.chatId;
        }
        return;
      }

      const newTab = createChatTab(content.chatId);
      state.tabs.push(newTab);
      if (activate) {
        state.activeTabId = newTab.id;
        state.currentChatId = content.chatId;
      }
    });
  },

  selectTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return;
      state.activeTabId = tab.id;
      state.currentChatId = getFocusedPane(tab).chatId;
    });
  },

  openChatInFocusedPane: (chatId) => {
    set((state) => {
      const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!activeTab) {
        const newTab = createChatTab(chatId);
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
        state.currentChatId = chatId;
        return;
      }

      const existingPane = findPaneByChatId(activeTab.layout, chatId);
      if (existingPane) {
        activeTab.focusedPaneId = existingPane.id;
      } else {
        activeTab.layout = replacePaneChat(activeTab.layout, activeTab.focusedPaneId, chatId);
      }
      state.currentChatId = chatId;
    });
  },

  focusPane: (tabId, paneId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      const pane = tab ? findPane(tab.layout, paneId) : null;
      if (!tab || !pane) return;
      tab.focusedPaneId = paneId;
      state.activeTabId = tabId;
      state.currentChatId = pane.chatId;
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
      state.currentChatId = findPane(tab.layout, paneId)?.chatId ?? state.currentChatId;
    });
  },

  splitPane: (tabId, paneId, chatId, direction) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || !findPane(tab.layout, paneId)) return;
      const existingPane = findPaneByChatId(tab.layout, chatId);
      if (existingPane) {
        tab.focusedPaneId = existingPane.id;
        state.currentChatId = existingPane.chatId;
        return;
      }
      const pane = createChatPane(chatId);
      tab.layout = insertPane(tab.layout, paneId, pane, direction);
      tab.focusedPaneId = pane.id;
      state.activeTabId = tab.id;
      state.currentChatId = chatId;
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
      state.currentChatId = source.chatId;
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
          state.currentChatId = neighbor ? getFocusedPane(neighbor).chatId : null;
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
        state.currentChatId = getFocusedPane(tab).chatId;
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
      state.currentChatId = next.chatId;
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
        state.currentChatId = neighbor ? getFocusedPane(neighbor).chatId : null;
      }
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const keptTab = state.tabs.find((tab) => tab.id === tabId);
      if (!keptTab || state.tabs.length < 2) return;
      state.tabs = [keptTab];
      state.activeTabId = keptTab.id;
      state.currentChatId = getFocusedPane(keptTab).chatId;
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
        state.currentChatId = getFocusedPane(keptTabs[0]).chatId;
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
        state.currentChatId = getFocusedPane(neighbor).chatId;
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

  removeTabsByChatIds: (chatIds) => {
    if (chatIds.length === 0) return;
    const deletedChatIds = new Set(chatIds);
    set((state) => {
      for (const chatId of deletedChatIds) delete state.chatDrafts[chatId];

      state.tabs = state.tabs.flatMap((tab) => {
        const layout = removeChats(tab.layout, deletedChatIds);
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
      state.currentChatId = activeTab ? getFocusedPane(activeTab).chatId : null;
    });
  },
});
