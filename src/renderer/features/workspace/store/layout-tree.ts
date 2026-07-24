import type {
  ChatLayoutNode,
  ChatPaneState,
  ChatPaneView,
  ChatSplitState,
  TabStateItem,
} from "@shared/ipc";

export type PaneDropPosition = "center" | "left" | "right" | "top" | "bottom";
export type SplitDirection = Exclude<PaneDropPosition, "center">;

const DEFAULT_VIEW: ChatPaneView = "/chat";

export function createChatPane(chatId: string): ChatPaneState {
  return {
    id: crypto.randomUUID(),
    type: "pane",
    chatId,
    view: DEFAULT_VIEW,
  };
}

export function createChatTab(chatId: string): TabStateItem {
  const pane = createChatPane(chatId);
  return {
    id: crypto.randomUUID(),
    type: "chat",
    layout: pane,
    focusedPaneId: pane.id,
  };
}

export function getPanes(node: ChatLayoutNode): ChatPaneState[] {
  if (node.type === "pane") {
    return [node];
  }
  return node.children.flatMap(getPanes);
}

export function findPane(node: ChatLayoutNode, paneId: string): ChatPaneState | null {
  if (node.type === "pane") {
    return node.id === paneId ? node : null;
  }
  for (const child of node.children) {
    const pane = findPane(child, paneId);
    if (pane) return pane;
  }
  return null;
}

export function findPaneByChatId(node: ChatLayoutNode, chatId: string): ChatPaneState | null {
  return getPanes(node).find((pane) => pane.chatId === chatId) ?? null;
}

export function getFocusedPane(tab: TabStateItem): ChatPaneState {
  return findPane(tab.layout, tab.focusedPaneId) ?? getPanes(tab.layout)[0];
}

export function replacePaneChat(
  node: ChatLayoutNode,
  paneId: string,
  chatId: string,
): ChatLayoutNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return { ...node, chatId, view: DEFAULT_VIEW, graphMessageId: undefined };
  }
  return {
    ...node,
    children: node.children.map((child) => replacePaneChat(child, paneId, chatId)),
  };
}

export function updatePane(
  node: ChatLayoutNode,
  paneId: string,
  update: Partial<Pick<ChatPaneState, "view" | "graphMessageId">>,
): ChatLayoutNode {
  if (node.type === "pane") {
    return node.id === paneId ? { ...node, ...update } : node;
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
  target: ChatLayoutNode,
  inserted: ChatPaneState,
  direction: SplitDirection,
): ChatSplitState {
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
  node: ChatLayoutNode,
  targetPaneId: string,
  inserted: ChatPaneState,
  direction: SplitDirection,
): ChatLayoutNode {
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

export function removePane(node: ChatLayoutNode, paneId: string): ChatLayoutNode | null {
  if (node.type === "pane") {
    return node.id === paneId ? null : node;
  }

  const children = node.children
    .map((child) => removePane(child, paneId))
    .filter((child): child is ChatLayoutNode => child !== null);

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
  node: ChatLayoutNode,
  replacements: ReadonlyMap<string, ChatPaneState>,
): ChatLayoutNode {
  if (node.type === "pane") return replacements.get(node.id) ?? node;
  return { ...node, children: node.children.map((child) => replaceNodes(child, replacements)) };
}

export function movePane(
  node: ChatLayoutNode,
  sourcePaneId: string,
  targetPaneId: string,
  position: PaneDropPosition,
): ChatLayoutNode {
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
  node: ChatLayoutNode,
  splitId: string,
  layout: Readonly<Record<string, number>>,
): ChatLayoutNode {
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

export function removeChats(
  node: ChatLayoutNode,
  deletedChatIds: ReadonlySet<string>,
): ChatLayoutNode | null {
  if (node.type === "pane") {
    return deletedChatIds.has(node.chatId) ? null : node;
  }
  const children = node.children
    .map((child) => removeChats(child, deletedChatIds))
    .filter((child): child is ChatLayoutNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children, sizes: normalizedSizes(children.length) };
}

export function normalizeTab(tab: TabStateItem): TabStateItem | null {
  const panes = getPanes(tab.layout);
  if (panes.length === 0) return null;
  const uniqueChatIds = new Set<string>();
  const duplicatePaneIds = new Set(
    panes
      .filter((pane) => {
        if (uniqueChatIds.has(pane.chatId)) return true;
        uniqueChatIds.add(pane.chatId);
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
