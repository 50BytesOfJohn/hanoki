import type { Tab, TabContent, TabsSlice, WorkspaceSliceCreator } from "../types";

export const createTabsSlice: WorkspaceSliceCreator<TabsSlice> = (set, get) => ({
  tabs: [],
  activeTabId: null,

  activeTab: () => {
    const state = get();

    return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0] ?? null;
  },

  openTab: (content: TabContent, opts = { mode: "auto" }) => {
    set((state) => {
      const existingTab =
        content.type === "empty"
          ? state.tabs.find((tab) => tab.type === "empty")
          : content.type === "chat"
            ? state.tabs.find((tab) => tab.type === "chat" && tab.chatId === content.chatId)
            : undefined;

      if (existingTab) {
        state.activeTabId = existingTab.id;
        return;
      }

      const newTab: Tab = {
        id: crypto.randomUUID(),

        ...content,
      };

      /**
       * If empty and non-existing just push, never set dirty on empty tab
       */
      if (newTab.type === "empty") {
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
        return;
      }

      /**
       * Here we know that tab doesn't exists,
       * if new tab mode was done, we will push
       * tab as new without other logic, and we will set it as dirty as well
       */
      if (opts.mode === "new-tab") {
        state.tabs.push({ ...newTab, isDirty: true });
        state.activeTabId = newTab.id;
        return;
      }

      const activeTabIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);

      if (activeTabIndex !== -1 && !state.tabs[activeTabIndex].isDirty) {
        /**
         * Active tab is not dirty and exists so we will replace it
         */
        state.tabs[activeTabIndex] = newTab;
      } else {
        state.tabs.push(newTab);
      }

      state.activeTabId = newTab.id;
    });
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) => tab.id === tabId);

      if (tabIndex === -1) {
        return;
      }

      state.tabs.splice(tabIndex, 1);

      if (state.activeTabId === tabId) {
        state.activeTabId = state.tabs[tabIndex - 1]?.id ?? state.tabs[0]?.id ?? null;
      }
    });
  },

  removeTabsByChatIds: (chatIds) => {
    if (chatIds.length === 0) {
      return;
    }

    const deletedChatIds = new Set(chatIds);

    set((state) => {
      const nextTabs = state.tabs.filter(
        (tab) => tab.type !== "chat" || !deletedChatIds.has(tab.chatId),
      );

      if (nextTabs.length === state.tabs.length) {
        return;
      }

      state.tabs = nextTabs;

      if (state.activeTabId && !nextTabs.some((tab) => tab.id === state.activeTabId)) {
        state.activeTabId = nextTabs.at(-1)?.id ?? null;
      }
    });
  },

  setActiveTab: (tabId) => {
    set((state) => {
      state.activeTabId = tabId;
    });
  },
});
