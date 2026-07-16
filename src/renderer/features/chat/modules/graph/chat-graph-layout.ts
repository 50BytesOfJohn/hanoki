import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import { graphlib, layout } from "@dagrejs/dagre";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";

export const NODE_WIDTH = 352;
export const NODE_HEIGHT = 288;

export interface ChatGraphNodeData extends Record<string, unknown> {
  childCount: number;
  hasMultipleChildren: boolean;
  isActivePath: boolean;
  isSelected: boolean;
  preview: string;
  role: HanokiUiMessage["role"];
}

export type ChatGraphNode = Node<ChatGraphNodeData, "message">;

export function buildChatGraphLayout(
  messages: readonly HanokiUiMessage[],
  activeMessageIds: ReadonlySet<string>,
  selectedMessageId: string | null,
): {
  edges: Edge[];
  nodes: ChatGraphNode[];
} {
  const dagreGraph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    edgesep: 40,
    marginx: 48,
    marginy: 48,
    nodesep: 88,
    rankdir: "TB",
    ranksep: 144,
  });

  const messageIds = new Set(messages.map((message) => message.id));
  const childrenByParentId = new Map<string | null, HanokiUiMessage[]>();

  for (const message of messages) {
    const parentId = message.metadata?.parentId ?? null;
    const children = childrenByParentId.get(parentId) ?? [];
    children.push(message);
    childrenByParentId.set(parentId, children);
  }

  for (const message of messages) {
    dagreGraph.setNode(message.id, { height: NODE_HEIGHT, width: NODE_WIDTH });
  }

  const edges: Edge[] = [];

  for (const message of messages) {
    const parentId = message.metadata?.parentId ?? null;

    if (!parentId || !messageIds.has(parentId)) {
      continue;
    }

    dagreGraph.setEdge(parentId, message.id);

    const isActivePath = activeMessageIds.has(parentId) && activeMessageIds.has(message.id);

    edges.push({
      id: `${parentId}:${message.id}`,
      source: parentId,
      target: message.id,
      type: "smoothstep",
      animated: isActivePath,
      markerEnd: {
        height: 16,
        type: MarkerType.ArrowClosed,
        width: 16,
      },
      style: {
        stroke: isActivePath ? "var(--color-foreground)" : "var(--color-border)",
        strokeWidth: isActivePath ? 2.25 : 1.5,
      },
    });
  }

  layout(dagreGraph);

  const nodes: ChatGraphNode[] = messages.map((message) => {
    const layoutNode = dagreGraph.node(message.id);
    const childCount = childrenByParentId.get(message.id)?.length ?? 0;

    return {
      id: message.id,
      type: "message",
      data: {
        childCount,
        hasMultipleChildren: childCount > 1,
        isActivePath: activeMessageIds.has(message.id),
        isSelected: selectedMessageId === message.id,
        preview: getMessagePreview(message),
        role: message.role,
      },
      position: {
        x: layoutNode.x - NODE_WIDTH / 2,
        y: layoutNode.y - NODE_HEIGHT / 2,
      },
      initialHeight: NODE_HEIGHT,
      initialWidth: NODE_WIDTH,
      sourcePosition: Position.Bottom,
      style: {
        height: NODE_HEIGHT,
        width: NODE_WIDTH,
      },
      targetPosition: Position.Top,
    };
  });

  return { edges, nodes };
}

function getMessagePreview(message: HanokiUiMessage): string {
  const text = message.parts
    .filter(
      (part): part is Extract<HanokiUiMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return message.role === "assistant" ? "Assistant response" : "Message";
  }

  if (text.length <= 220) {
    return text;
  }

  return `${text.slice(0, 217).trimEnd()}...`;
}
