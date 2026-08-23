import { describe, expect, it } from "vitest";
import type { ItemPaneState } from "@shared/ipc";
import {
  createItemPane,
  createItemTab,
  findPane,
  getPanes,
  insertPane,
  movePane,
  normalizeTab,
  removePane,
  resizeSplit,
} from "./layout-tree";

function pane(id: string, itemId = id): ItemPaneState {
  return { id, type: "pane", itemId, itemType: "chat", view: "/chat" };
}

describe("chat layout tree", () => {
  it("creates and preserves Markdown pane state", () => {
    const pane = createItemPane("markdown-item", "markdown");
    const tab = createItemTab("markdown-item", "markdown");

    expect(pane).toMatchObject({
      itemId: "markdown-item",
      itemType: "markdown",
      view: "/markdown",
    });
    expect(normalizeTab(tab)?.layout).toMatchObject({
      itemId: "markdown-item",
      itemType: "markdown",
      view: "/markdown",
    });
  });

  it("creates nested directional splits and preserves pane identity", () => {
    const horizontal = insertPane(pane("a"), "a", pane("b"), "right");
    const nested = insertPane(horizontal, "b", pane("c"), "bottom");

    expect(nested.type).toBe("split");
    expect(getPanes(nested).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(findPane(nested, "c")?.itemId).toBe("c");
    if (nested.type === "split") expect(nested.children[1].type).toBe("split");
  });

  it("joins a matching split and balances the target panel size", () => {
    const first = insertPane(pane("a"), "a", pane("b"), "right");
    const joined = insertPane(first, "a", pane("c"), "left");

    expect(joined.type).toBe("split");
    if (joined.type !== "split") return;
    expect(joined.children.map((child) => child.id)).toEqual(["c", "a", "b"]);
    expect(joined.sizes.reduce((sum, size) => sum + size, 0)).toBeCloseTo(100);
  });

  it("collapses redundant split branches when a pane closes", () => {
    const horizontal = insertPane(pane("a"), "a", pane("b"), "right");
    const nested = insertPane(horizontal, "b", pane("c"), "bottom");
    const result = removePane(nested, "b");

    expect(result).not.toBeNull();
    expect(result ? getPanes(result).map((item) => item.id) : []).toEqual(["a", "c"]);
    expect(result?.type).toBe("split");
  });

  it("swaps pane positions for center drops and moves panes for edge drops", () => {
    const initial = insertPane(pane("a"), "a", pane("b"), "right");
    const swapped = movePane(initial, "a", "b", "center");
    expect(getPanes(swapped).map((item) => item.id)).toEqual(["b", "a"]);

    const moved = movePane(swapped, "a", "b", "top");
    expect(getPanes(moved).map((item) => item.id)).toEqual(["a", "b"]);
    expect(moved.type).toBe("split");
    if (moved.type === "split") expect(moved.orientation).toBe("vertical");
  });

  it("persists completed resize percentages by child id", () => {
    const initial = insertPane(pane("a"), "a", pane("b"), "right");
    const resized = resizeSplit(initial, initial.id, { a: 30, b: 70 });

    expect(resized.type).toBe("split");
    if (resized.type === "split") expect(resized.sizes).toEqual([30, 70]);
  });
});
