import * as React from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  getViewportForBounds,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
  type OnConnectEnd,
  type OnDelete,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import { useHotkey, useHotkeys, type Hotkey } from "@tanstack/react-hotkeys";
import {
  AiMagicIcon,
  Alert02Icon,
  HierarchyIcon,
  MergeIcon,
  Redo02Icon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HotkeyKbd } from "@/features/chat/model-picker/model-picker-parts";
import { useWorkspaceStore } from "@/features/workspace/store";
import {
  canConnect,
  createWorkflowAiNode,
  createWorkflowEdge,
  createWorkflowMergeNode,
  duplicateWorkflowStep,
  getNodesNotReachingOutput,
  isStepNode,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowStepNode,
} from "@shared/workflow/graph";

import {
  endWorkflowEditBurst,
  redoWorkflowGraph,
  undoWorkflowGraph,
  updateWorkflowGraph,
  useFlushWorkflowOnUnmount,
  useWorkflow,
  useWorkflowHistory,
  useWorkflowSaveProblem,
  type UpdateWorkflowGraph,
} from "./workflow-graph-store";
import { WORKFLOW_NODE_TYPES, type WorkflowFlowNode } from "./workflow-flow-nodes";
import { WorkflowInspector } from "./workflow-inspector";
import {
  findOpenWorkflowPosition,
  getDefaultNodeSize,
  tidyWorkflowLayout,
  type WorkflowNodeSize,
} from "./workflow-layout";

import "@xyflow/react/dist/style.css";

const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.1 };
const DELETE_KEYS = ["Backspace", "Delete"];
const NEW_STEP_GAP = 24;
const MIN_NEW_STEP_DRAG = 48;

const WORKFLOW_HOTKEYS = {
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
  redoAlt: "Mod+Y",
  duplicate: "Mod+D",
} satisfies Record<string, Hotkey>;

/** Text fields keep their own undo; the graph's applies everywhere else in the pane. */
const HOTKEY_OPTIONS = {
  ignoreInputs: true,
  preventDefault: true,
  stopPropagation: false,
  requireReset: false,
  // One registration per workflow pane; `enabled: isFocusedPane` picks the live one.
  conflictBehavior: "allow",
} as const;

export function WorkflowEditorPane({
  workflowId,
  tabId,
  paneId,
}: {
  workflowId: string;
  tabId: string;
  paneId: string;
}) {
  const workflow = useWorkflow(workflowId);
  useFlushWorkflowOnUnmount(workflowId);
  // Every tab and pane stays mounted, so shortcuts only listen in the focused one.
  const isFocusedPane = useWorkspaceStore(
    (state) =>
      state.activeTabId === tabId &&
      state.tabs.find((tab) => tab.id === tabId)?.focusedPaneId === paneId,
  );
  if (!workflow) return null;
  if (workflow.data.graphError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div role="alert" className="flex max-w-md flex-col gap-2 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-warning">
            <HugeiconsIcon icon={Alert02Icon} className="size-4" />
            This workflow can't be opened
          </p>
          <p className="text-muted-foreground">
            Its saved steps don't read as a workflow, so it can't be edited or run. Its data was
            left as it is.
          </p>
          <p className="font-mono text-xs break-words text-muted-foreground">
            {workflow.data.graphError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <WorkflowCanvas
        workflowId={workflowId}
        graph={workflow.data.graph}
        isFocusedPane={isFocusedPane}
      />
    </ReactFlowProvider>
  );
}

function WorkflowCanvas({
  workflowId,
  graph,
  isFocusedPane,
}: {
  workflowId: string;
  graph: WorkflowGraph;
  isFocusedPane: boolean;
}) {
  const reactFlow = useReactFlow<WorkflowFlowNode>();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = React.useState<ReadonlySet<string>>(new Set());
  // Panes resize as splits open and settle; keep the graph in view until the user moves it.
  const userMovedViewRef = React.useRef(false);
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (!userMovedViewRef.current) void reactFlow.fitView(FIT_VIEW_OPTIONS);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [reactFlow]);
  const notReachingOutput = React.useMemo(() => getNodesNotReachingOutput(graph), [graph]);
  const updateGraph = React.useCallback<UpdateWorkflowGraph>(
    (update, options) => updateWorkflowGraph(workflowId, update, options),
    [workflowId],
  );
  const endEditBurst = React.useCallback(() => endWorkflowEditBurst(workflowId), [workflowId]);
  const { canUndo, canRedo } = useWorkflowHistory(workflowId);
  const saveProblem = useWorkflowSaveProblem(workflowId);
  const undo = React.useCallback(() => undoWorkflowGraph(workflowId), [workflowId]);
  const redo = React.useCallback(() => redoWorkflowGraph(workflowId), [workflowId]);

  // React Flow measures nodes into its own copies, so they live in state and
  // follow the graph; unchanged nodes keep their identity and skip rendering.
  const [flowNodes, setFlowNodes] = React.useState<WorkflowFlowNode[]>(() =>
    toFlowNodes(graph, notReachingOutput, []),
  );
  const [syncedGraph, setSyncedGraph] = React.useState(graph);
  if (syncedGraph !== graph) {
    setSyncedGraph(graph);
    setFlowNodes((previous) => toFlowNodes(graph, notReachingOutput, previous));
    // Undo can take the selected step away; its inspector goes with it.
    if (selectedNodeId !== null && !graph.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }

  const edges = React.useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        selected: selectedEdgeIds.has(edge.id),
        className: "workflow-edge",
      })),
    [graph.edges, selectedEdgeIds],
  );

  const onNodesChange = React.useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      setFlowNodes((current) => applyNodeChanges(changes, current));
      // A drag commits once, when it ends, so it is one undo step. Removals go through onDelete.
      const moved = new Map<string, { x: number; y: number }>();
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          moved.set(change.id, change.position);
        }
      }
      if (moved.size === 0) return;
      updateGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          const position = moved.get(node.id);
          return position ? { ...node, position } : node;
        }),
      }));
    },
    [updateGraph],
  );

  // Edges are derived from the graph, so their selection is kept here.
  const onEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    if (!changes.some((change) => change.type === "select")) return;
    setSelectedEdgeIds((current) => {
      const next = new Set(current);
      for (const change of changes) {
        if (change.type !== "select") continue;
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      return next;
    });
  }, []);

  // One deletion (a node with its edges, or a whole selection) is one undo step.
  const onDelete = React.useCallback<OnDelete<WorkflowFlowNode, Edge>>(
    ({ nodes, edges }) => {
      const removedNodes = new Set(nodes.map((node) => node.id));
      const removedEdges = new Set(edges.map((edge) => edge.id));
      updateGraph((current) => ({
        nodes: current.nodes.filter((node) => !(removedNodes.has(node.id) && isStepNode(node))),
        edges: current.edges.filter(
          (edge) =>
            !removedEdges.has(edge.id) &&
            !removedNodes.has(edge.source) &&
            !removedNodes.has(edge.target),
        ),
      }));
    },
    [updateGraph],
  );

  const onSelectionChange = React.useCallback<OnSelectionChangeFunc>(({ nodes, edges }) => {
    setSelectedNodeId(nodes.length === 1 ? nodes[0]!.id : null);
    setSelectedEdgeIds(new Set(edges.map((edge) => edge.id)));
  }, []);

  const isValidConnection = React.useCallback<IsValidConnection>(
    (connection) => canConnect(graph, connection.source, connection.target).ok,
    [graph],
  );

  const onConnect = React.useCallback(
    (connection: Connection) => {
      updateGraph((current) =>
        canConnect(current, connection.source, connection.target).ok
          ? {
              ...current,
              edges: [...current.edges, createWorkflowEdge(connection.source, connection.target)],
            }
          : current,
      );
    },
    [updateGraph],
  );

  /** Adds a step in one undo step and opens it in the inspector. */
  const insertStep = (node: WorkflowStepNode, edges: readonly WorkflowEdge[] = []) => {
    updateGraph((current) => ({
      nodes: [...current.nodes, node],
      edges: [...current.edges, ...edges],
    }));
    setFlowNodes((current) => [
      ...current.map((flowNode) =>
        flowNode.selected ? { ...flowNode, selected: false } : flowNode,
      ),
      ...toFlowNodes({ nodes: [node], edges: [] }, new Set([node.id]), []).map((flowNode) => ({
        ...flowNode,
        selected: true,
      })),
    ]);
    setSelectedNodeId(node.id);
  };

  const addStep = (kind: "ai" | "merge") => {
    const bounds = containerRef.current?.getBoundingClientRect();
    const center = reactFlow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2,
    });
    const size = getDefaultNodeSize(kind);
    // Repeated adds step down and right instead of stacking exactly.
    const position = findOpenWorkflowPosition(graph, {
      x: Math.round(center.x - size.width / 2),
      y: Math.round(center.y - size.height / 2),
    });
    insertStep(
      kind === "ai"
        ? createWorkflowAiNode(graph, position)
        : createWorkflowMergeNode(graph, position),
    );
  };

  const duplicateStep = (nodeId: string) => {
    const source = graph.nodes.find((node) => node.id === nodeId);
    if (!source) return;
    const height =
      reactFlow.getNode(nodeId)?.measured?.height ?? getDefaultNodeSize(source.type).height;
    const position = findOpenWorkflowPosition(graph, {
      x: source.position.x,
      y: source.position.y + height + NEW_STEP_GAP,
    });
    const result = duplicateWorkflowStep(graph, nodeId, position);
    if (!result) return;
    const edges = result.graph.edges.filter((edge) => edge.target === result.node.id);
    insertStep(result.node, edges);
  };

  // Letting go of a new connection on empty canvas adds a step there, already connected.
  const onConnectEnd: OnConnectEnd = (event, connection) => {
    if (connection.isValid || connection.toNode || !connection.fromNode) return;
    const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!pointer) return;
    const drop = reactFlow.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
    // A twitch on a handle is not a request for a new step.
    if (Math.hypot(drop.x - connection.from.x, drop.y - connection.from.y) < MIN_NEW_STEP_DRAG) {
      return;
    }
    // Dragged from an output, the new step follows; from an input, it feeds that step.
    const fromOutput = connection.fromHandle?.type !== "target";
    const size = getDefaultNodeSize("ai");
    const node = createWorkflowAiNode(graph, {
      x: Math.round(fromOutput ? drop.x : drop.x - size.width),
      y: Math.round(drop.y - size.height / 2),
    });
    const edge = fromOutput
      ? createWorkflowEdge(connection.fromNode.id, node.id)
      : createWorkflowEdge(node.id, connection.fromNode.id);
    const withNode = { ...graph, nodes: [...graph.nodes, node] };
    if (canConnect(withNode, edge.source, edge.target).ok) insertStep(node, [edge]);
  };

  const tidyUp = () => {
    const sizes = new Map<string, WorkflowNodeSize>();
    for (const flowNode of reactFlow.getNodes()) {
      if (flowNode.measured?.width && flowNode.measured.height) {
        sizes.set(flowNode.id, {
          width: flowNode.measured.width,
          height: flowNode.measured.height,
        });
      }
    }
    const tidy = tidyWorkflowLayout(graph, sizes);
    updateGraph(() => tidy);
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return;
    const viewport = getViewportForBounds(
      getGraphBounds(tidy, sizes),
      container.width,
      container.height,
      0.2,
      FIT_VIEW_OPTIONS.maxZoom,
      FIT_VIEW_OPTIONS.padding,
    );
    void reactFlow.setViewport(viewport, { duration: 150 });
  };

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const closeInspector = () => {
    setSelectedNodeId(null);
    setFlowNodes((current) =>
      current.map((flowNode) => (flowNode.selected ? { ...flowNode, selected: false } : flowNode)),
    );
  };

  useHotkey(WORKFLOW_HOTKEYS.undo, undo, { ...HOTKEY_OPTIONS, enabled: isFocusedPane });
  useHotkeys(
    [
      { hotkey: WORKFLOW_HOTKEYS.redo, callback: redo },
      { hotkey: WORKFLOW_HOTKEYS.redoAlt, callback: redo },
    ],
    { ...HOTKEY_OPTIONS, enabled: isFocusedPane },
  );
  useHotkey(
    WORKFLOW_HOTKEYS.duplicate,
    () => {
      if (selectedNode && isStepNode(selectedNode)) duplicateStep(selectedNode.id);
    },
    {
      ...HOTKEY_OPTIONS,
      enabled: isFocusedPane && selectedNode !== null && isStepNode(selectedNode),
    },
  );

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1">
      <ReactFlow<WorkflowFlowNode>
        colorMode="dark"
        nodes={flowNodes}
        edges={edges}
        nodeTypes={WORKFLOW_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onDelete={onDelete}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        // React Flow listens on the whole document, and hidden tabs stay mounted:
        // only the focused pane's editor may delete its selection.
        deleteKeyCode={isFocusedPane ? DELETE_KEYS : null}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.2}
        maxZoom={1.6}
        panOnScroll
        onMoveStart={(event) => {
          // Programmatic moves (fitting the view) come without an event.
          if (event) userMovedViewRef.current = true;
        }}
        selectionOnDrag={false}
        defaultEdgeOptions={{ interactionWidth: 16 }}
        connectionLineStyle={{ stroke: "var(--focus)", strokeWidth: 1.5 }}
        className="workflow-canvas"
      >
        <Background color="var(--color-border)" gap={24} size={1} />
        <Controls
          className="!overflow-hidden !rounded-md !border !border-border !bg-card !shadow-sm [&_.react-flow__controls-button]:!h-7 [&_.react-flow__controls-button]:!w-7 [&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!bg-card [&_.react-flow__controls-button]:!text-muted-foreground [&_.react-flow__controls-button:hover]:!bg-hover [&_.react-flow__controls-button:hover]:!text-foreground [&_.react-flow__controls-button_svg]:!fill-current"
          showInteractive={false}
        />
      </ReactFlow>

      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-overlay p-1 shadow-lg shadow-black/20">
        <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => addStep("ai")}>
          <HugeiconsIcon icon={AiMagicIcon} data-icon="inline-start" />
          AI step
        </Button>
        <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => addStep("merge")}>
          <HugeiconsIcon icon={MergeIcon} data-icon="inline-start" />
          Merge
        </Button>
        <Separator orientation="vertical" className="mx-0.5 h-4!" />
        <ToolbarIconButton
          label="Undo"
          icon={Undo02Icon}
          hotkey={WORKFLOW_HOTKEYS.undo}
          disabled={!canUndo}
          onClick={undo}
        />
        <ToolbarIconButton
          label="Redo"
          icon={Redo02Icon}
          hotkey={WORKFLOW_HOTKEYS.redo}
          disabled={!canRedo}
          onClick={redo}
        />
        <ToolbarIconButton label="Tidy up" icon={HierarchyIcon} onClick={tidyUp} />
        {saveProblem ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="status"
                  className="flex min-w-0 items-center gap-1.5 px-2 text-xs text-destructive"
                  tabIndex={0}
                />
              }
            >
              <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" />
              <span className="max-w-64 truncate">Not saved: {saveProblem}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              Edits stay on screen but aren't saved until this is fixed. {saveProblem}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {notReachingOutput.size > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="flex items-center gap-1.5 px-2 text-xs text-warning"
                  tabIndex={0}
                />
              }
            >
              <HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
              {notReachingOutput.size} not connected to Output
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              These steps still run and their results are saved in the run, but they don't shape the
              reply.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {selectedNode ? (
        <WorkflowInspector
          key={selectedNode.id}
          graph={graph}
          node={selectedNode}
          updateGraph={updateGraph}
          onEditPause={endEditBurst}
          onDuplicate={isStepNode(selectedNode) ? () => duplicateStep(selectedNode.id) : undefined}
          duplicateHotkey={WORKFLOW_HOTKEYS.duplicate}
          onClose={closeInspector}
        />
      ) : null}
    </div>
  );
}

function ToolbarIconButton({
  label,
  icon,
  hotkey,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  hotkey?: Hotkey;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            <HugeiconsIcon icon={icon} className="size-3.5!" />
          </Button>
        }
      />
      <TooltipContent className="flex items-center gap-2">
        {label}
        {hotkey ? <HotkeyKbd hotkey={hotkey} /> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function getGraphBounds(graph: WorkflowGraph, sizes: ReadonlyMap<string, WorkflowNodeSize>) {
  const rects = graph.nodes.map((node) => ({
    ...node.position,
    ...(sizes.get(node.id) ?? getDefaultNodeSize(node.type)),
  }));
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
}

function toFlowNodes(
  graph: WorkflowGraph,
  notReachingOutput: ReadonlySet<string>,
  previous: readonly WorkflowFlowNode[],
): WorkflowFlowNode[] {
  const previousById = new Map(previous.map((flowNode) => [flowNode.id, flowNode]));
  return graph.nodes.map((node): WorkflowFlowNode => {
    const before = previousById.get(node.id);
    const isUnreachable = notReachingOutput.has(node.id);
    if (
      before &&
      before.data.node === node &&
      ("notReachingOutput" in before.data ? before.data.notReachingOutput : false) === isUnreachable
    ) {
      return before;
    }
    return toFlowNode(node, isUnreachable, before);
  });
}

function toFlowNode(
  node: WorkflowNode,
  notReachingOutput: boolean,
  before: WorkflowFlowNode | undefined,
): WorkflowFlowNode {
  const shared = {
    id: node.id,
    // While dragging, React Flow's copy is ahead of the graph; keep it.
    position: before?.dragging ? before.position : node.position,
    ...(before?.measured ? { measured: before.measured } : {}),
    ...(before?.selected ? { selected: true } : {}),
    ...(before?.dragging ? { dragging: true } : {}),
  };
  if (isStepNode(node)) {
    return { ...shared, type: "workflowStep", data: { node, notReachingOutput } };
  }
  return { ...shared, type: "workflowEndpoint", deletable: false, data: { node } };
}
