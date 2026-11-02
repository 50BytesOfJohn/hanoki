import { graphlib, layout } from "@dagrejs/dagre";

import type { WorkflowGraph, WorkflowNodeType, WorkflowPosition } from "@shared/workflow/graph";

export interface WorkflowNodeSize {
  width: number;
  height: number;
}

/** Sizes of the node views before React Flow has measured them. */
const STEP_SIZE: WorkflowNodeSize = { width: 224, height: 84 };
const ENDPOINT_SIZE: WorkflowNodeSize = { width: 180, height: 34 };
const STACK_OFFSET = 24;

export function getDefaultNodeSize(type: WorkflowNodeType): WorkflowNodeSize {
  return type === "ai" || type === "merge" ? STEP_SIZE : ENDPOINT_SIZE;
}

/**
 * Lays the graph out left to right in the order it runs. The result starts
 * where the old layout did, so tidying does not throw the view somewhere else.
 */
export function tidyWorkflowLayout(
  graph: WorkflowGraph,
  sizes: ReadonlyMap<string, WorkflowNodeSize>,
): WorkflowGraph {
  if (graph.nodes.length === 0) return graph;
  const dagreGraph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 36 });
  for (const node of graph.nodes) {
    // Dagre writes the layout into the label, so each node gets its own.
    dagreGraph.setNode(node.id, { ...(sizes.get(node.id) ?? getDefaultNodeSize(node.type)) });
  }
  for (const edge of graph.edges) dagreGraph.setEdge(edge.source, edge.target);
  layout(dagreGraph);

  // Dagre places node centres; React Flow positions are top-left corners.
  const placed = new Map(
    graph.nodes.map((node) => {
      const { x, y, width, height } = dagreGraph.node(node.id);
      return [node.id, { x: x - width / 2, y: y - height / 2 }];
    }),
  );
  const from = getTopLeft(graph.nodes.map((node) => node.position));
  const to = getTopLeft([...placed.values()]);
  let moved = false;
  const nodes = graph.nodes.map((node) => {
    const placement = placed.get(node.id)!;
    const x = Math.round(placement.x - to.x + from.x);
    const y = Math.round(placement.y - to.y + from.y);
    if (x === node.position.x && y === node.position.y) return node;
    moved = true;
    return { ...node, position: { x, y } };
  });
  // Tidying a tidy graph is not an edit.
  return moved ? { ...graph, nodes } : graph;
}

/** `position`, nudged down and right until no node starts exactly there. */
export function findOpenWorkflowPosition(
  graph: WorkflowGraph,
  position: WorkflowPosition,
): WorkflowPosition {
  let candidate = position;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const taken = graph.nodes.some(
      (node) =>
        Math.abs(node.position.x - candidate.x) < STACK_OFFSET / 2 &&
        Math.abs(node.position.y - candidate.y) < STACK_OFFSET / 2,
    );
    if (!taken) return candidate;
    candidate = { x: candidate.x + STACK_OFFSET, y: candidate.y + STACK_OFFSET };
  }
  return candidate;
}

function getTopLeft(positions: readonly WorkflowPosition[]): WorkflowPosition {
  return {
    x: Math.min(...positions.map((position) => position.x)),
    y: Math.min(...positions.map((position) => position.y)),
  };
}
