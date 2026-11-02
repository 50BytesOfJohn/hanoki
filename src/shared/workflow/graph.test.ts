import { describe, expect, it } from "vitest";

import {
  canConnect,
  createDefaultWorkflowGraph,
  createMergeTemplate,
  createUniqueStepKey,
  createWorkflowEdge,
  duplicateWorkflowStep,
  getMainPath,
  getNodesNotReachingOutput,
  getOrderedSteps,
  getStepWarnings,
  getTemplateReferences,
  getUnusedMergeInputs,
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

describe("getUnusedMergeInputs", () => {
  /** A second review pass built by duplicating the first Merge: wired anew, template not. */
  function secondPass(): WorkflowGraph {
    const graph = createDefaultWorkflowGraph();
    const merge = graph.nodes.find((node) => node.id === "merge")!;
    const review = graph.nodes.find((node) => node.id === "review")!;
    const review2 = { ...review, id: "review2", key: "review_2", name: "Review 2" };
    const merge2 = { ...merge, id: "merge2", key: "merge_2", name: "Merge 2" };
    graph.nodes.push(review2, merge2);
    graph.edges = graph.edges.filter((edge) => edge.target !== "output");
    graph.edges.push(
      createWorkflowEdge("rewrite", "review2"),
      createWorkflowEdge("rewrite", "merge2"),
      createWorkflowEdge("review2", "merge2"),
      createWorkflowEdge("merge2", "output"),
    );
    return graph;
  }

  it("names connected steps a copied template no longer reads", () => {
    const graph = secondPass();
    const merge2 = graph.nodes.find((node) => node.id === "merge2");
    if (merge2?.type !== "merge") throw new Error("missing merge");
    expect(getUnusedMergeInputs(graph, merge2).map((node) => node.id)).toEqual([
      "rewrite",
      "review2",
    ]);
    expect(getStepWarnings(graph).get("merge2")).toContain("“Rewrite” and “Review 2”");
  });

  it("builds a template that reads every connected step, the text before its review", () => {
    const graph = secondPass();
    // Connected review first: the template still leads with the rewrite.
    graph.edges.sort((a, b) => (a.source === "review2" ? -1 : b.source === "review2" ? 1 : 0));
    expect(createMergeTemplate(graph, "merge2")).toBe(
      "<rewrite>\n{{step.rewrite}}\n</rewrite>\n\n<review_2>\n{{step.review_2}}\n</review_2>",
    );
    const fixed = graph.nodes.map((node) =>
      node.id === "merge2" && node.type === "merge"
        ? { ...node, template: createMergeTemplate(graph, "merge2") }
        : node,
    );
    expect(getMainPath({ ...graph, nodes: fixed }).map((node) => node.id)).toContain("rewrite");
  });

  it("accepts the default graph, an empty template and {{input}}", () => {
    const graph = createDefaultWorkflowGraph();
    const merge = graph.nodes.find((node) => node.id === "merge");
    if (merge?.type !== "merge") throw new Error("missing merge");
    expect(getUnusedMergeInputs(graph, merge)).toEqual([]);
    expect(getUnusedMergeInputs(graph, { ...merge, template: "" })).toEqual([]);
    expect(getUnusedMergeInputs(graph, { ...merge, template: "{{input}}" })).toEqual([]);
    expect(getStepWarnings(graph).size).toBe(0);
  });
});
