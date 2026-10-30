import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { GlobalChatSettings } from "@shared/ipc";

import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { getFocusedPane, getPanes } from "../layout-tree";
import type { WorkspaceStoreState } from "../types";
import { createTabsSlice } from "./tabs-slice";

function createStore() {
  return create<WorkspaceStoreState>()(
    immer(
      (...args) =>
        ({
          activeTabId: null,
          currentChatId: null,
          chatDrafts: {},
          ...createTabsSlice(...args),
        }) as WorkspaceStoreState,
    ),
  );
}

let store: ReturnType<typeof createStore>;
const state = () => store.getState();
const openItems = () => state().tabs.map((tab) => getFocusedPane(tab).itemId);
const activeItem = () => {
  const tab = state().tabs.find((candidate) => candidate.id === state().activeTabId);
  return tab ? getFocusedPane(tab).itemId : null;
};
const tabOf = (itemId: string) =>
  state().tabs.find((tab) => getPanes(tab.layout).some((pane) => pane.itemId === itemId))!;
const setPreferences = (preferences: Partial<GlobalChatSettings>) =>
  queryClient.setQueryData(queryKeys.settings.globalChat(), preferences);

beforeEach(() => {
  store = createStore();
  queryClient.removeQueries({ queryKey: queryKeys.settings.globalChat() });
});

describe("opening with a click", () => {
  it("reuses one preview tab and leaves kept tabs alone", () => {
    state().openTab({ type: "chat", itemId: "kept" });
    state().openItem("a", "chat");
    state().openItem("b", "chat");

    expect(openItems()).toEqual(["kept", "b"]);
    expect(activeItem()).toBe("b");
    expect(tabOf("kept").preview).toBeUndefined();
    expect(tabOf("b").preview).toBe(true);
  });

  it("switches to an item open in another tab instead of duplicating it", () => {
    state().openTab({ type: "chat", itemId: "a" });
    state().openTab({ type: "chat", itemId: "b" });
    state().openItem("a", "chat");

    expect(openItems()).toEqual(["a", "b"]);
    expect(activeItem()).toBe("a");
  });

  it("promotes on the second click of a double-click", () => {
    state().openItem("a", "chat");
    state().openTab({ type: "chat", itemId: "a" });
    state().openItem("b", "chat");

    expect(openItems()).toEqual(["a", "b"]);
    expect(tabOf("a").preview).toBeUndefined();
  });

  it("never previews terminals", () => {
    state().openItem("term", "terminal");
    state().openItem("a", "chat");

    expect(openItems()).toEqual(["term", "a"]);
    expect(tabOf("term").preview).toBeUndefined();
  });

  it("does not disturb a split when clicking another item", () => {
    state().openTab({ type: "chat", itemId: "a" });
    const tab = state().tabs[0];
    state().splitPane(tab.id, tab.focusedPaneId, "b", "chat", "right");
    state().openItem("c", "chat");

    expect(state().tabs).toHaveLength(2);
    expect(getPanes(state().tabs[0].layout)).toHaveLength(2);
    expect(activeItem()).toBe("c");
  });

  it("opens kept tabs under the new-tab setting", () => {
    setPreferences({ tabOpenBehavior: "new-tab" });
    state().openItem("a", "chat");
    state().openItem("b", "chat");

    expect(openItems()).toEqual(["a", "b"]);
    expect(state().tabs.some((tab) => tab.preview)).toBe(false);
  });

  it("replaces the focused pane under the current-tab setting, unless asked for a new tab", () => {
    setPreferences({ tabOpenBehavior: "current-tab" });
    state().openItem("a", "chat");
    state().openItem("b", "chat");
    expect(openItems()).toEqual(["b"]);

    state().openItem("c", "chat", { newTab: true });
    expect(openItems()).toEqual(["b", "c"]);
  });
});

describe("keeping a preview tab", () => {
  it("keeps it when the item is engaged with", () => {
    state().openItem("a", "chat");
    state().keepItem("a");
    state().openItem("b", "chat");

    expect(openItems()).toEqual(["a", "b"]);
  });

  it("keeps it when split or dragged", () => {
    state().openItem("a", "chat");
    const tab = state().tabs[0];
    state().splitPane(tab.id, tab.focusedPaneId, "b", "chat", "right");
    expect(state().tabs[0].preview).toBeUndefined();

    state().openItem("c", "chat");
    state().moveTab(tabOf("c").id, 0);
    expect(tabOf("c").preview).toBeUndefined();
  });
});

describe("tab placement", () => {
  it("inserts next to the active tab by default", () => {
    state().openTab({ type: "chat", itemId: "a" });
    state().openTab({ type: "chat", itemId: "b" });
    state().selectTab(tabOf("a").id);
    state().openTab({ type: "chat", itemId: "c" });

    expect(openItems()).toEqual(["a", "c", "b"]);
  });

  it("appends under the end setting", () => {
    setPreferences({ tabInsertPosition: "end" });
    state().openTab({ type: "chat", itemId: "a" });
    state().openTab({ type: "chat", itemId: "b" });
    state().selectTab(tabOf("a").id);
    state().openTab({ type: "chat", itemId: "c" });

    expect(openItems()).toEqual(["a", "b", "c"]);
  });
});

describe("closing", () => {
  const openThree = () => {
    state().openTab({ type: "chat", itemId: "a" });
    state().openTab({ type: "chat", itemId: "b" });
    state().openTab({ type: "chat", itemId: "c" });
    state().selectTab(tabOf("a").id);
    state().selectTab(tabOf("b").id);
  };

  it("returns to the last used tab by default", () => {
    openThree();
    state().closeTab(tabOf("b").id);
    expect(activeItem()).toBe("a");
  });

  it("goes to the neighbor under the adjacent setting", () => {
    setPreferences({ tabCloseFocus: "adjacent" });
    openThree();
    state().closeTab(tabOf("b").id);
    expect(activeItem()).toBe("c");
  });

  it("keeps the active tab when closing a background one", () => {
    openThree();
    state().closeTab(tabOf("c").id);
    expect(activeItem()).toBe("b");
  });

  it("clears the selection when the last tab closes", () => {
    state().openTab({ type: "chat", itemId: "a" });
    state().closeTab(tabOf("a").id);
    expect(state().activeTabId).toBeNull();
    expect(state().currentChatId).toBeNull();
  });

  it("reopens closed tabs in place, newest first, without duplicates", () => {
    openThree();
    state().closeTab(tabOf("b").id);
    state().closeTab(tabOf("a").id);

    state().reopenClosedTab();
    expect(openItems()).toEqual(["a", "c"]);

    state().openTab({ type: "chat", itemId: "b" });
    state().reopenClosedTab();
    expect(openItems()).toEqual(["a", "b", "c"]);
  });

  it("does not reopen tabs whose item was deleted", () => {
    state().openTab({ type: "chat", itemId: "a" });
    state().closeTab(tabOf("a").id);
    state().removeTabsByItemIds(["a"]);
    state().reopenClosedTab();

    expect(state().tabs).toHaveLength(0);
  });
});
