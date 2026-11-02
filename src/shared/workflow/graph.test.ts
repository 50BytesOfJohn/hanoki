import { describe, expect, it } from "vitest";

import {
  canConnect,
  createDefaultWorkflowGraph,
  createUniqueStepKey,
  createWorkflowEdge,
  duplicateWorkflowStep,
  getMainPath,
  getNodesNotReachingOutput,
  getOrderedSteps,
  getTemplateReferences,
  parseWorkflowGraph,
  renameStepKey,
  renderTemplate,
  type WorkflowGraph,
} from "./graph";
import { selectWorkflowOutput, type WorkflowStepState } from "./run";

function done(nodeId: string, output: string): WorkflowStepState {
  return { nodeId, status: "done", output };
}

describe("parseWorkflowGraph", () => {
  it("accepts the default graph", () => {
    expect(parseWorkflowGraph(createDefaultWorkflowGraph()).ok).toBe(true);
  });

  it("rejects a loop", () => {
    const graph = createDefaultWorkflowGraph();
    graph.edges.push(createWorkflowEdge("rewrite", "draft"));
    // Draft now has two inputs, which is reported first; drop the Input edge to reach the loop.
    graph.edges = graph.edges.filter((edge) => edge.source !== "input");
    expect(parseWorkflowGraph(graph)).toEqual({
      ok: false,
      error: "Workflows cannot contain loops.",
    });
  });

  it("rejects fan-in on an AI step", () => {
    const graph = createDefaultWorkflowGraph();
    graph.edges.push(createWorkflowEdge("review", "rewrite"));
    expect(parseWorkflowGraph(graph).ok).toBe(false);
  });

  it("rejects duplicate step keys", () => {
    const graph = createDefaultWorkflowGraph();
    const review = graph.nodes.find((node) => node.id === "review");
    if (review?.type === "ai") review.key = "draft";
    expect(parseWorkflowGraph(graph).ok).toBe(false);
  });
});

describe("canConnect", () => {
  const graph = createDefaultWorkflowGraph();

  it("allows extra inputs only on Merge", () => {
    expect(canConnect(graph, "input", "merge").ok).toBe(true);
    expect(canConnect(graph, "input", "rewrite").ok).toBe(false);
  });

  it("refuses connections that would loop", () => {
    expect(canConnect(graph, "rewrite", "merge")).toEqual({
      ok: false,
      reason: "Loops are not supported.",
    });
  });

  it("refuses connecting out of Output or into Input", () => {
    expect(canConnect(graph, "output", "draft").ok).toBe(false);
    expect(canConnect(graph, "draft", "input").ok).toBe(false);
  });
});

describe("graph analysis", () => {
  it("follows a Merge's first template reference along the main path", () => {
    expect(getMainPath(createDefaultWorkflowGraph()).map((node) => node.id)).toEqual([
      "output",
      "rewrite",
      "merge",
      "draft",
      "input",
    ]);
  });

  it("orders steps topologically", () => {
    expect(getOrderedSteps(createDefaultWorkflowGraph()).map((node) => node.id)).toEqual([
      "draft",
      "review",
      "merge",
      "rewrite",
    ]);
  });

  it("finds steps that never reach Output", () => {
    const graph: WorkflowGraph = createDefaultWorkflowGraph();
    graph.edges = graph.edges.filter((edge) => edge.target !== "merge" || edge.source !== "review");
    expect([...getNodesNotReachingOutput(graph)]).toEqual(["review"]);
  });
});

describe("duplicateWorkflowStep", () => {
  it("copies a step with a new key, fed by the same inputs", () => {
    const graph = createDefaultWorkflowGraph();
    const result = duplicateWorkflowStep(graph, "review", { x: 0, y: 0 })!;
    expect(result.node).toMatchObject({ type: "ai", name: "Review copy", key: "review_copy" });
    expect(result.node.id).not.toBe("review");
    expect(result.graph.edges.filter((edge) => edge.target === result.node.id)).toEqual([
      createWorkflowEdge("draft", result.node.id),
    ]);
    expect(result.graph.edges.some((edge) => edge.source === result.node.id)).toBe(false);
    expect(parseWorkflowGraph(result.graph).ok).toBe(true);
  });

  it("keeps every input of a Merge", () => {
    const result = duplicateWorkflowStep(createDefaultWorkflowGraph(), "merge", { x: 0, y: 0 })!;
    expect(result.graph.edges.filter((edge) => edge.target === result.node.id)).toHaveLength(2);
  });

  it("does not duplicate Input or Output", () => {
    expect(duplicateWorkflowStep(createDefaultWorkflowGraph(), "input", { x: 0, y: 0 })).toBeNull();
  });
});

describe("templates", () => {
  it("renders inputs and known steps, and blanks unknown ones", () => {
    expect(
      renderTemplate("{{ input }} / {{step.draft}} / {{step.nope}}", {
        input: "in",
        steps: new Map([["draft", "d"]]),
      }),
    ).toBe("in / d / ");
  });

  it("lists referenced keys once, in order", () => {
    expect(getTemplateReferences("{{step.b}} {{step.a}} {{step.b}} {{input}}")).toEqual(["b", "a"]);
  });

  it("renames a key in every template", () => {
    const renamed = renameStepKey(createDefaultWorkflowGraph(), "draft", "first_pass");
    const merge = renamed.nodes.find((node) => node.id === "merge");
    expect(merge?.type === "merge" && merge.template).toContain("{{step.first_pass}}");
    expect(renamed.nodes.find((node) => node.id === "draft")).toMatchObject({ key: "first_pass" });
  });

  it("derives unique keys", () => {
    const graph = createDefaultWorkflowGraph();
    expect(createUniqueStepKey("Draft", graph)).toBe("draft_2");
    expect(createUniqueStepKey("Draft", graph, "draft")).toBe("draft");
    expect(createUniqueStepKey("Écrire l'idée!", graph)).toBe("ecrire_l_idee");
  });
});

describe("selectWorkflowOutput", () => {
  const graph = createDefaultWorkflowGraph();

  it("uses what reached Output", () => {
    const steps = new Map([
      ["draft", done("draft", "draft text")],
      ["rewrite", done("rewrite", "final text")],
    ]);
    expect(selectWorkflowOutput(graph, steps)).toEqual({ nodeId: "rewrite", text: "final text" });
  });

  it("falls back to the last finished AI step on the main path", () => {
    const steps = new Map<string, WorkflowStepState>([
      ["draft", done("draft", "draft text")],
      ["review", done("review", "review text")],
      ["merge", done("merge", "merged")],
      ["rewrite", { nodeId: "rewrite", status: "stopped", output: "par", partial: true }],
    ]);
    expect(selectWorkflowOutput(graph, steps)).toEqual({ nodeId: "draft", text: "draft text" });
  });

  it("returns null when nothing finished", () => {
    expect(selectWorkflowOutput(graph, new Map())).toBeNull();
  });
});
