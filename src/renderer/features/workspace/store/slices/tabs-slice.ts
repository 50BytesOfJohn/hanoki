import type { Tab, TabContent, TabsSlice, WorkspaceSliceCreator } from "../types";

export const createTabsSlice: WorkspaceSliceCreator<TabsSlice> = (set) => ({
  tabs: [],

  openTab: (content: TabContent) => {
    set((state) => {
      const existingTab = state.tabs.find((tab) => tab.chatId === content.chatId);

      if (existingTab) {
        state.currentChatId = existingTab.chatId;
        return;
      }

      const newTab: Tab = {
        id: crypto.randomUUID(),
        ...content,
      };

      state.tabs.push(newTab);
      state.currentChatId = newTab.chatId;
    });
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);

      if (tabIndex === -1) {
        return;
      }

      state.tabs.splice(tabIndex, 1);
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

      if (nextTabs.length === state.tabs.length) {
        return;
      }

      state.tabs = nextTabs;

      if (state.currentChatId && deletedChatIds.has(state.currentChatId)) {
        state.currentChatId = null;
      }
    });
  },
});
