import type { OpenTabOptions, Tab, TabContent, TabsSlice, WorkspaceSliceCreator } from "../types";

export const createTabsSlice: WorkspaceSliceCreator<TabsSlice> = (set) => ({
  tabs: [],

  openTab: (content: TabContent, options?: OpenTabOptions) => {
    const activate = options?.activate ?? true;

    set((state) => {
      const existingTab = state.tabs.find((tab) => tab.chatId === content.chatId);

      if (existingTab) {
        if (activate) {
          state.currentChatId = existingTab.chatId;
        }
        return;
      }

      const newTab: Tab = {
        id: crypto.randomUUID(),
        ...content,
      };

      state.tabs.push(newTab);

      if (activate) {
        state.currentChatId = newTab.chatId;
      }
    });
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);

      if (tabIndex === -1) {
        return;
      }

      const closedTab = state.tabs[tabIndex];
      state.tabs.splice(tabIndex, 1);

      // Closing the active tab focuses its neighbor, like IDE tabs.
      if (closedTab.chatId === state.currentChatId) {
        const neighbor = state.tabs[tabIndex] ?? state.tabs[tabIndex - 1];
        if (neighbor) {
          state.currentChatId = neighbor.chatId;
        }
      }
    });
  },

  closeOtherTabs: (tabId) => {
    set((state) => {
      const keptTab = state.tabs.find((tab) => tab.id === tabId);

      if (!keptTab || state.tabs.length < 2) {
        return;
      }

      const hadCurrentTab = state.tabs.some((tab) => tab.chatId === state.currentChatId);
      state.tabs = [keptTab];

      if (hadCurrentTab && keptTab.chatId !== state.currentChatId) {
        state.currentChatId = keptTab.chatId;
      }
    });
  },

  closeTabsToLeft: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex <= 0) {
        return;
      }

      const keptTabs = state.tabs.slice(tabIndex);
      const hadCurrentTab = state.tabs.some((tab) => tab.chatId === state.currentChatId);
      state.tabs = keptTabs;

      if (hadCurrentTab && !keptTabs.some((tab) => tab.chatId === state.currentChatId)) {
        state.currentChatId = keptTabs[0]?.chatId ?? null;
      }
    });
  },

  closeTabsToRight: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1 || tabIndex >= state.tabs.length - 1) {
        return;
      }

      const keptTabs = state.tabs.slice(0, tabIndex + 1);
      const hadCurrentTab = state.tabs.some((tab) => tab.chatId === state.currentChatId);
      state.tabs = keptTabs;

      if (hadCurrentTab && !keptTabs.some((tab) => tab.chatId === state.currentChatId)) {
        state.currentChatId = keptTabs[keptTabs.length - 1]?.chatId ?? null;
      }
    });
  },

  moveTab: (tabId, toIndex) => {
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === tabId);

      if (fromIndex === -1 || fromIndex === toIndex) {
        return;
      }

      const [tab] = state.tabs.splice(fromIndex, 1);
      state.tabs.splice(toIndex, 0, tab);
    });
  },

  closeAllTabs: () => {
    set((state) => {
      state.tabs = [];
    });
  },

  removeTabsByChatIds: (chatIds) => {
    if (chatIds.length === 0) {
      return;
    }

    const deletedChatIds = new Set(chatIds);

    set((state) => {
      for (const chatId of deletedChatIds) {
        delete state.chatDrafts[chatId];
        delete state.chatViews[chatId];
      }

      const nextTabs = state.tabs.filter(
        (tab) => tab.type !== "chat" || !deletedChatIds.has(tab.chatId),
      );

      if (nextTabs.length !== state.tabs.length) {
        state.tabs = nextTabs;
      }

      if (state.currentChatId && deletedChatIds.has(state.currentChatId)) {
        state.currentChatId = nextTabs[0]?.chatId ?? null;
      }
    });
  },
});
