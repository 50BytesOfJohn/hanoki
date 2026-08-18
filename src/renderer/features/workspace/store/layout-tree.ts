import type {
  ItemLayoutNode,
  ItemPaneState,
  ItemType,
  ChatPaneView,
  ItemSplitState,
  TabStateItem,
} from "@shared/ipc";

export type PaneDropPosition = "center" | "left" | "right" | "top" | "bottom";
export type SplitDirection = Exclude<PaneDropPosition, "center">;

const DEFAULT_VIEW: ChatPaneView = "/chat";

export function createItemPane(itemId: string, itemType: ItemType): ItemPaneState {
  return {
    id: crypto.randomUUID(),
    type: "pane",
    itemId,
    itemType,
    view: itemType === "chat" ? DEFAULT_VIEW : "/terminal",
  } as ItemPaneState;
}

export function createChatPane(chatId: string): ItemPaneState {
  return createItemPane(chatId, "chat");
}

export function createItemTab(itemId: string, itemType: ItemType): TabStateItem {
  const pane = createItemPane(itemId, itemType);
  return {
    id: crypto.randomUUID(),
    type: "item",
    layout: pane,
    focusedPaneId: pane.id,
  };
}

export function createChatTab(chatId: string): TabStateItem {
  return createItemTab(chatId, "chat");
}

export function getPanes(node: ItemLayoutNode): ItemPaneState[] {
  if (node.type === "pane") {
    return [node];
  }
  return node.children.flatMap(getPanes);
}

export function findPane(node: ItemLayoutNode, paneId: string): ItemPaneState | null {
  if (node.type === "pane") {
    return node.id === paneId ? node : null;
  }
  for (const child of node.children) {
    const pane = findPane(child, paneId);
    if (pane) return pane;
  }
  return null;
}

export function findPaneByItemId(node: ItemLayoutNode, itemId: string): ItemPaneState | null {
  return getPanes(node).find((pane) => pane.itemId === itemId) ?? null;
}

export function findPaneByChatId(node: ItemLayoutNode, chatId: string): ItemPaneState | null {
  return getPanes(node).find((pane) => pane.itemType === "chat" && pane.itemId === chatId) ?? null;
}

export function getFocusedPane(tab: TabStateItem): ItemPaneState {
  return findPane(tab.layout, tab.focusedPaneId) ?? getPanes(tab.layout)[0];
}

export function replacePaneItem(
  node: ItemLayoutNode,
  paneId: string,
  itemId: string,
  itemType: ItemType,
): ItemLayoutNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return createPaneWithId(paneId, itemId, itemType);
  }
  return {
    ...node,
    children: node.children.map((child) => replacePaneItem(child, paneId, itemId, itemType)),
  };
}

function createPaneWithId(id: string, itemId: string, itemType: ItemType): ItemPaneState {
  return itemType === "chat"
    ? { id, type: "pane", itemId, itemType: "chat", view: DEFAULT_VIEW }
    : { id, type: "pane", itemId, itemType: "terminal", view: "/terminal" };
}

export function updatePane(
  node: ItemLayoutNode,
  paneId: string,
  update: Partial<Pick<Extract<ItemPaneState, { itemType: "chat" }>, "view" | "graphMessageId">>,
): ItemLayoutNode {
  if (node.type === "pane") {
    return node.id === paneId && node.itemType === "chat" ? { ...node, ...update } : node;
  }
  return { ...node, children: node.children.map((child) => updatePane(child, paneId, update)) };
}

function normalizedSizes(length: number, sizes?: readonly number[]): number[] {
  if (
    !sizes ||
    sizes.length !== length ||
    sizes.some((size) => !Number.isFinite(size) || size <= 0)
  ) {
    return Array.from({ length }, () => 100 / length);
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return sizes.map((size) => (size / total) * 100);
}

function splitAround(
  target: ItemLayoutNode,
  inserted: ItemPaneState,
  direction: SplitDirection,
): ItemSplitState {
  const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const before = direction === "left" || direction === "top";
  return {
    id: crypto.randomUUID(),
    type: "split",
    orientation,
    children: before ? [inserted, target] : [target, inserted],
    sizes: [50, 50],
  };
}

export function insertPane(
  node: ItemLayoutNode,
  targetPaneId: string,
  inserted: ItemPaneState,
  direction: SplitDirection,
): ItemLayoutNode {
  if (node.type === "pane") {
    return node.id === targetPaneId ? splitAround(node, inserted, direction) : node;
  }

  const targetIndex = node.children.findIndex((child) => findPane(child, targetPaneId));
  if (targetIndex === -1) return node;

  const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const targetChild = node.children[targetIndex];
  if (node.orientation === orientation && targetChild.type === "pane") {
    const before = direction === "left" || direction === "top";
    const children = [...node.children];
    const sizes = normalizedSizes(node.children.length, node.sizes);
    const targetSize = sizes[targetIndex];
    children.splice(before ? targetIndex : targetIndex + 1, 0, inserted);
    sizes[targetIndex] = targetSize / 2;
    sizes.splice(before ? targetIndex : targetIndex + 1, 0, targetSize / 2);
    return { ...node, children, sizes };
  }

  const children = [...node.children];
  children[targetIndex] = insertPane(targetChild, targetPaneId, inserted, direction);
  return { ...node, children };
}

export function removePane(node: ItemLayoutNode, paneId: string): ItemLayoutNode | null {
  if (node.type === "pane") {
    return node.id === paneId ? null : node;
  }

  const children = node.children
    .map((child) => removePane(child, paneId))
    .filter((child): child is ItemLayoutNode => child !== null);

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];

  const keptIds = new Set(children.map((child) => child.id));
  const sizes = normalizedSizes(
    children.length,
    node.children.flatMap((child, index) => (keptIds.has(child.id) ? [node.sizes[index]] : [])),
  );
  return { ...node, children, sizes };
}

function replaceNodes(
  node: ItemLayoutNode,
  replacements: ReadonlyMap<string, ItemPaneState>,
): ItemLayoutNode {
  if (node.type === "pane") return replacements.get(node.id) ?? node;
  return { ...node, children: node.children.map((child) => replaceNodes(child, replacements)) };
}

export function movePane(
  node: ItemLayoutNode,
  sourcePaneId: string,
  targetPaneId: string,
  position: PaneDropPosition,
): ItemLayoutNode {
  if (sourcePaneId === targetPaneId) return node;
  const source = findPane(node, sourcePaneId);
  const target = findPane(node, targetPaneId);
  if (!source || !target) return node;

  if (position === "center") {
    return replaceNodes(
      node,
      new Map([
        [sourcePaneId, target],
        [targetPaneId, source],
      ]),
    );
  }

  const withoutSource = removePane(node, sourcePaneId);
  if (!withoutSource || !findPane(withoutSource, targetPaneId)) return node;
  return insertPane(withoutSource, targetPaneId, source, position);
}

export function resizeSplit(
  node: ItemLayoutNode,
  splitId: string,
  layout: Readonly<Record<string, number>>,
): ItemLayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) {
    return {
      ...node,
      sizes: normalizedSizes(
        node.children.length,
        node.children.map((child) => layout[child.id]),
      ),
    };
  }
  return { ...node, children: node.children.map((child) => resizeSplit(child, splitId, layout)) };
}

export function removeItems(
  node: ItemLayoutNode,
  deletedItemIds: ReadonlySet<string>,
): ItemLayoutNode | null {
  if (node.type === "pane") {
    return deletedItemIds.has(node.itemId) ? null : node;
  }
  const children = node.children
    .map((child) => removeItems(child, deletedItemIds))
    .filter((child): child is ItemLayoutNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children, sizes: normalizedSizes(children.length) };
}

export function normalizeTab(tab: TabStateItem): TabStateItem | null {
  const panes = getPanes(tab.layout);
  if (panes.length === 0) return null;
  const uniqueItemIds = new Set<string>();
  const duplicatePaneIds = new Set(
    panes
      .filter((pane) => {
        if (uniqueItemIds.has(pane.itemId)) return true;
        uniqueItemIds.add(pane.itemId);
        return false;
      })
      .map((pane) => pane.id),
  );
  let layout = tab.layout;
  for (const paneId of duplicatePaneIds) {
    layout = removePane(layout, paneId) ?? panes[0];
  }
  const normalizedPanes = getPanes(layout);
  return {
    ...tab,
    layout,
    focusedPaneId: normalizedPanes.some((pane) => pane.id === tab.focusedPaneId)
      ? tab.focusedPaneId
      : normalizedPanes[0].id,
  };
}
