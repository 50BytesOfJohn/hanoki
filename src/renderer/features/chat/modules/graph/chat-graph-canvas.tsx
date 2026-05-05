import * as React from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";

import { NODE_HEIGHT, NODE_WIDTH, buildChatGraphLayout } from "./chat-graph-layout";
import { ChatGraphNodeView } from "./chat-graph-node";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  message: ChatGraphNodeView,
};

const MINIMAP_COLORS = {
  active: "#3f7a5f",
  default: "#5b6270",
  selected: "#d4d4d8",
};

interface ChatGraphCanvasProps {
  activeMessageIds: ReadonlySet<string>;
  focusMessageId: string | null;
  messages: readonly HanokiUiMessage[];
  onFocusHandled?: (messageId: string) => void;
  onSelectBranch: (messageId: string) => void;
  selectedMessageId: string | null;
}

export function ChatGraphCanvas({
  activeMessageIds,
  focusMessageId,
  messages,
  onFocusHandled,
  onSelectBranch,
  selectedMessageId,
}: ChatGraphCanvasProps) {
  const [reactFlow, setReactFlow] = React.useState<ReactFlowInstance | null>(null);
  const handledFocusIdRef = React.useRef<string | null>(null);
  const { edges, nodes } = React.useMemo(
    () => buildChatGraphLayout(messages, activeMessageIds, selectedMessageId),
    [activeMessageIds, messages, selectedMessageId],
  );

  const handleNodeClick = React.useCallback<NodeMouseHandler>(
    (_event, node) => {
      onSelectBranch(node.id);
    },
    [onSelectBranch],
  );

  React.useEffect(() => {
    if (!focusMessageId) {
      handledFocusIdRef.current = null;
      return;
    }

    if (!reactFlow?.viewportInitialized || handledFocusIdRef.current === focusMessageId) {
      return;
    }

    const node = nodes.find((entry) => entry.id === focusMessageId);
    if (!node) {
      return;
    }

    handledFocusIdRef.current = focusMessageId;

    void reactFlow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
      duration: 0,
      zoom: Math.max(reactFlow.getZoom(), 0.95),
    });
    onFocusHandled?.(focusMessageId);
  }, [focusMessageId, nodes, onFocusHandled, reactFlow]);

  return (
    <div className="h-full w-full bg-background">
      <ReactFlow
        key={messages.at(-1)?.id ?? "empty"}
        colorMode="dark"
        fitView
        fitViewOptions={{ duration: 300, padding: 0.28 }}
        edges={edges}
        elementsSelectable={false}
        maxZoom={1.6}
        minZoom={0.2}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onlyRenderVisibleElements
        onInit={setReactFlow}
        onNodeClick={handleNodeClick}
        panOnScroll
      >
        <Background color="var(--color-border)" gap={24} size={1} />
        <MiniMap
          bgColor="#171717"
          className="!overflow-hidden !rounded-xl !border !border-border !shadow-sm"
          maskColor="rgba(10, 10, 10, 0.72)"
          maskStrokeColor="#525252"
          maskStrokeWidth={1.5}
          nodeBorderRadius={6}
          nodeColor={(node) => {
            if (node.data?.isSelected) {
              return MINIMAP_COLORS.selected;
            }

            if (node.data?.isActivePath) {
              return MINIMAP_COLORS.active;
            }

            return MINIMAP_COLORS.default;
          }}
          nodeStrokeColor="#0a0a0a"
          nodeStrokeWidth={2}
          pannable
          zoomable
        />
        <Controls
          className="!overflow-hidden !rounded-xl !border !border-border !bg-card !shadow-sm [&_.react-flow__controls-button]:!h-10 [&_.react-flow__controls-button]:!w-10 [&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!bg-card [&_.react-flow__controls-button]:!text-foreground [&_.react-flow__controls-button:hover]:!bg-muted [&_.react-flow__controls-button:hover]:!text-foreground [&_.react-flow__controls-button_svg]:!fill-current"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
