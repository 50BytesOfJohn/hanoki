import { afterEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import type { ItemInfo, WorkflowInfo } from "@shared/ipc";
import { createDefaultWorkflowGraph, type WorkflowGraph } from "@shared/workflow/graph";

import {
  flushPendingWorkflowSaves,
  forgetWorkflows,
  updateWorkflowGraph,
} from "./workflow-graph-store";

const { updateGraph } = vi.hoisted(() => ({ updateGraph: vi.fn() }));
vi.mock("@/api/workflows", () => ({ workflowsApi: { updateGraph } }));
vi.mock("@/components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));

const WORKFLOW_ID = "01a19c36-9708-70f5-b2e1-d165bdef8da6";

function seed(graph: WorkflowGraph, updatedAt: number): void {
  const workflow: WorkflowInfo = {
    id: WORKFLOW_ID,
    workspaceId: "019cd9d2-267a-74ba-9041-a073af381a95",
    folderId: null,
    title: "Workflow",
    metadata: {},
    extensions: {},
    createdAt: 1,
    updatedAt,
    type: "workflow",
    data: { graph },
  };
  // A refetch lands in the cache the same way.
  queryClient.setQueryData<ItemInfo>(queryKeys.items.byId(WORKFLOW_ID), workflow);
}

function cachedGraph(): WorkflowGraph | undefined {
  const item = queryClient.getQueryData<ItemInfo>(queryKeys.items.byId(WORKFLOW_ID));
  return item?.type === "workflow" ? item.data.graph : undefined;
}

function rename(graph: WorkflowGraph, name: string): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.type === "ai" ? { ...node, name } : node)),
  };
}

function aiNames(graph: WorkflowGraph | undefined): string[] {
  return (graph?.nodes ?? []).flatMap((node) => (node.type === "ai" ? [node.name] : []));
}

afterEach(() => {
  forgetWorkflows([WORKFLOW_ID]);
  queryClient.clear();
  updateGraph.mockReset();
});

describe("workflow graph store", () => {
  it("keeps an unsaved edit over a refetch of the stored graph, then saves it", async () => {
    const stored = createDefaultWorkflowGraph();
    seed(stored, 100);
    updateGraph.mockResolvedValue({ updatedAt: 200 });

    updateWorkflowGraph(WORKFLOW_ID, (graph) => rename(graph, "Edited"));
    seed(structuredClone(stored), 150);

    expect(aiNames(cachedGraph()).every((name) => name === "Edited")).toBe(true);
    await flushPendingWorkflowSaves();
    expect(updateGraph).toHaveBeenCalledTimes(1);
    expect(aiNames(updateGraph.mock.calls[0]![1] as WorkflowGraph)).toEqual(aiNames(cachedGraph()));
  });

  it("takes a refetch once the stored row includes the saved edit", async () => {
    seed(createDefaultWorkflowGraph(), 100);
    updateGraph.mockResolvedValue({ updatedAt: 200 });

    updateWorkflowGraph(WORKFLOW_ID, (graph) => rename(graph, "Edited"));
    await flushPendingWorkflowSaves();
    // Changed elsewhere after the save, e.g. by the assistant.
    seed(rename(createDefaultWorkflowGraph(), "From elsewhere"), 300);

    expect(aiNames(cachedGraph()).every((name) => name === "From elsewhere")).toBe(true);
  });

  it("keeps an invalid edit on screen without saving it", async () => {
    const stored = createDefaultWorkflowGraph();
    seed(stored, 100);

    updateWorkflowGraph(WORKFLOW_ID, (graph) => rename(graph, ""));
    seed(structuredClone(stored), 150);

    expect(aiNames(cachedGraph()).every((name) => name === "")).toBe(true);
    await flushPendingWorkflowSaves();
    expect(updateGraph).not.toHaveBeenCalled();
  });
});
