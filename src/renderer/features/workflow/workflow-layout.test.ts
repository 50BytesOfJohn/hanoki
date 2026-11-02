import { describe, expect, it } from "vitest";

import {
  createDefaultWorkflowGraph,
  createWorkflowAiNode,
  type WorkflowGraph,
} from "@shared/workflow/graph";

import { findOpenWorkflowPosition, tidyWorkflowLayout } from "./workflow-layout";

function positionOf(graph: WorkflowGraph, id: string) {
  return graph.nodes.find((node) => node.id === id)!.position;
}

describe("tidyWorkflowLayout", () => {
  it("lays steps out left to right in run order, from the old top-left corner", () => {
    const graph = createDefaultWorkflowGraph();
    const tidy = tidyWorkflowLayout(graph, new Map());
    const order = ["input", "draft", "review", "merge", "rewrite", "output"];
    for (const [index, id] of order.slice(1).entries()) {
      expect(positionOf(tidy, id).x).toBeGreaterThan(positionOf(tidy, order[index]!).x);
    }
    expect(Math.min(...tidy.nodes.map((node) => node.position.x))).toBe(0);
    expect(Math.min(...tidy.nodes.map((node) => node.position.y))).toBe(120);
    expect(tidy.edges).toBe(graph.edges);
    expect(tidyWorkflowLayout(tidy, new Map())).toBe(tidy);
  });
});

describe("findOpenWorkflowPosition", () => {
  it("keeps a free position and nudges a taken one", () => {
    const base = createDefaultWorkflowGraph();
    const graph = {
      ...base,
      nodes: [...base.nodes, createWorkflowAiNode(base, { x: 244, y: 144 })],
    };
    expect(findOpenWorkflowPosition(graph, { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    // Draft starts at (220, 120); the next spot is taken too.
    expect(findOpenWorkflowPosition(graph, { x: 220, y: 120 })).toEqual({ x: 268, y: 168 });
  });
});
