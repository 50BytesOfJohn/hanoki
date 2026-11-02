import { describe, expect, it } from "vitest";

import {
  createDefaultWorkflowGraph,
  type WorkflowAiNode,
  type WorkflowGraph,
} from "@shared/workflow/graph";
import { planWorkflowRerun, type WorkflowStepState } from "@shared/workflow/run";

import { mergeSameRoleTurns } from "../model-message-turns";
import { buildStepRequest, runWorkflow, type WorkflowModelCall } from "./run-workflow";

const MODEL = { modelId: "model-a", reasoningEffort: null };

function resolvedGraph(): WorkflowGraph {
  const graph = createDefaultWorkflowGraph();
  for (const node of graph.nodes) if (node.type === "ai") node.model = MODEL;
  return graph;
}

function aiNode(graph: WorkflowGraph, id: string): WorkflowAiNode {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (node?.type !== "ai") throw new Error(`No AI node ${id}`);
  return node;
}

function allText(call: WorkflowModelCall): string {
  return call.messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
}

describe("runWorkflow", () => {
  it("runs the default review flow and streams each step", async () => {
    const calls: string[] = [];
    const updates: WorkflowStepState[] = [];
    const states = await runWorkflow({
      graph: resolvedGraph(),
      input: "Write a poem",
      context: { messages: [{ role: "user", content: "Write a poem" }], instructions: "Be kind" },
      signal: new AbortController().signal,
      callModel: async (call) => {
        const name = call.system?.includes("editor")
          ? "review"
          : allText(call).includes("<draft>")
            ? "rewrite"
            : "draft";
        calls.push(name);
        call.onText(`${name}-`);
        call.onText("text");
        return { modelId: call.model.modelId, tokens: { input: 1, output: 2 } };
      },
      onStep: (state) => updates.push(state),
    });

    expect(calls).toEqual(["draft", "review", "rewrite"]);
    expect(states.get("merge")?.output).toBe(
      "<draft>\ndraft-text\n</draft>\n\n<review>\nreview-text\n</review>",
    );
    expect(states.get("rewrite")).toMatchObject({ status: "done", output: "rewrite-text" });
    expect(updates.some((state) => state.nodeId === "draft" && state.output === "draft-")).toBe(
      true,
    );
  });

  it("runs branches that fan out of one step at the same time", async () => {
    const graph = resolvedGraph();
    // Rewrite now reads the draft directly, so it no longer waits for the review.
    graph.edges = graph.edges.map((edge) =>
      edge.target === "rewrite" ? { ...edge, id: "draft->rewrite", source: "draft" } : edge,
    );
    let active = 0;
    let maxActive = 0;
    await runWorkflow({
      graph,
      input: "x",
      context: { messages: [{ role: "user", content: "x" }], instructions: undefined },
      signal: new AbortController().signal,
      callModel: async (call) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        call.onText("ok");
        return { modelId: call.model.modelId };
      },
      onStep: () => {},
    });
    expect(maxActive).toBe(2);
  });

  it("keeps finished steps and partial text when stopped", async () => {
    const controller = new AbortController();
    const states = await runWorkflow({
      graph: resolvedGraph(),
      input: "x",
      context: { messages: [{ role: "user", content: "x" }], instructions: undefined },
      signal: controller.signal,
      callModel: async (call) => {
        if (call.system?.includes("editor")) {
          call.onText("half a rev");
          controller.abort();
          throw new DOMException("Stopped", "AbortError");
        }
        call.onText("draft");
        return { modelId: call.model.modelId };
      },
      onStep: () => {},
    });
    expect(states.get("draft")?.status).toBe("done");
    expect(states.get("review")).toMatchObject({
      status: "stopped",
      partial: true,
      output: "half a rev",
    });
    expect(states.get("rewrite")?.status).toBe("pending");
  });

  it("waits out provider limits and shows the wait", async () => {
    const statuses: string[] = [];
    let attempts = 0;
    const graph = resolvedGraph();
    for (const id of ["review", "rewrite"]) aiNode(graph, id).disabled = true;
    const states = await runWorkflow({
      graph,
      input: "x",
      context: { messages: [{ role: "user", content: "x" }], instructions: undefined },
      signal: new AbortController().signal,
      callModel: async (call) => {
        attempts += 1;
        if (attempts < 3) throw new Error("429 Too many concurrent requests");
        call.onText("ok");
        return { modelId: call.model.modelId };
      },
      getRetryDelay: () => 1,
      sleep: async () => {},
      onStep: (state) => {
        if (state.nodeId === "draft") statuses.push(state.status);
      },
    });
    expect(statuses).toContain("waiting");
    expect(states.get("draft")).toMatchObject({ status: "done", output: "ok" });
    expect(states.get("draft")?.retry).toBeUndefined();
  });

  it("does not run reused steps again", async () => {
    const called: string[] = [];
    const states = await runWorkflow({
      graph: resolvedGraph(),
      input: "x",
      context: { messages: [{ role: "user", content: "x" }], instructions: undefined },
      reused: new Map([
        ["draft", { nodeId: "draft", status: "done", output: "kept draft" }],
        ["review", { nodeId: "review", status: "done", output: "kept review" }],
      ]),
      signal: new AbortController().signal,
      callModel: async (call) => {
        called.push(allText(call));
        call.onText("new rewrite");
        return { modelId: call.model.modelId };
      },
      onStep: () => {},
    });
    expect(called).toHaveLength(1);
    expect(called[0]).toContain("kept draft");
    expect(states.get("draft")).toMatchObject({ reused: true, output: "kept draft" });
    expect(states.get("rewrite")?.output).toBe("new rewrite");
  });

  it("leaves out skipped steps", async () => {
    const called: string[] = [];
    const states = await runWorkflow({
      graph: resolvedGraph(),
      input: "x",
      context: { messages: [{ role: "user", content: "x" }], instructions: undefined },
      reused: new Map([["draft", { nodeId: "draft", status: "done", output: "kept draft" }]]),
      skip: new Set(["review", "merge", "rewrite"]),
      signal: new AbortController().signal,
      callModel: async (call) => {
        called.push(allText(call));
        return { modelId: call.model.modelId };
      },
      onStep: () => {},
    });
    expect(called).toHaveLength(0);
    expect(states.get("review")?.status).toBe("pending");
  });

  it("passes input through disabled steps", async () => {
    const graph = resolvedGraph();
    aiNode(graph, "rewrite").disabled = true;
    const states = await runWorkflow({
      graph,
      input: "x",
      context: { messages: [{ role: "user", content: "x" }], instructions: undefined },
      signal: new AbortController().signal,
      callModel: async (call) => {
        call.onText("t");
        return { modelId: call.model.modelId };
      },
      onStep: () => {},
    });
    expect(states.get("rewrite")).toMatchObject({
      status: "skipped",
      output: states.get("merge")?.output,
    });
  });
});

describe("buildStepRequest", () => {
  const graph = createDefaultWorkflowGraph();
  const input = graph.nodes.find((node) => node.type === "input");
  const context = {
    messages: [{ role: "user" as const, content: "Request" }],
    instructions: "Chat system",
  };

  it("does not repeat the request when context is included", () => {
    const request = buildStepRequest(aiNode(graph, "draft"), "Request", input, context, new Map());
    expect(request?.messages).toEqual([{ role: "user", content: "Request" }]);
    expect(request?.system).toBe("Chat system");
  });

  it("sends input and prompt as one user turn without context", () => {
    const review = aiNode(graph, "review");
    const request = buildStepRequest(review, "Draft", undefined, context, new Map());
    expect(request?.messages).toEqual([{ role: "user", content: `Draft\n\n${review.prompt}` }]);
    expect(request?.system).toBe(review.systemPrompt);
  });

  it("sends an assistant-role input as the model's own draft to continue", () => {
    const node = {
      ...aiNode(graph, "review"),
      role: "assistant" as const,
      prompt: "",
      includeContext: true,
    };
    const request = buildStepRequest(node, "Once upon \n", undefined, context, new Map());
    // Providers reject a prefill that ends in whitespace.
    expect(request?.messages).toEqual([
      { role: "user", content: "Request" },
      { role: "assistant", content: "Once upon" },
    ]);
    expect(request?.prefix).toBe("Once upon");
  });

  it("never opens a request with an assistant turn", () => {
    const node = { ...aiNode(graph, "review"), role: "assistant" as const, prompt: "" };
    const request = buildStepRequest(node, "Once upon", undefined, context, new Map());
    expect(request?.messages).toEqual([{ role: "user", content: "Once upon" }]);
    expect(request?.prefix).toBe("");

    const withPrompt = buildStepRequest(
      { ...node, prompt: "Go on." },
      "Once upon",
      undefined,
      context,
      new Map(),
    );
    expect(withPrompt?.messages).toEqual([{ role: "user", content: "Once upon\n\nGo on." }]);
  });

  it("lets a prompt place the input itself", () => {
    const node = { ...aiNode(graph, "review"), prompt: "Check: {{input}} vs {{step.draft}}" };
    const request = buildStepRequest(node, "A", undefined, context, new Map([["draft", "D"]]));
    expect(request?.messages).toEqual([{ role: "user", content: "Check: A vs D" }]);
  });

  it("alternates turns with a natural role", () => {
    const rewrite = aiNode(graph, "rewrite");
    expect(rewrite.role).toBe("natural");
    const merge = graph.nodes.find((node) => node.id === "merge");
    const request = buildStepRequest(rewrite, "Merged", merge, context, new Map());
    expect(request?.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    const noContext = buildStepRequest(
      { ...rewrite, includeContext: false },
      "Merged",
      merge,
      context,
      new Map(),
    );
    expect(noContext?.messages).toEqual([{ role: "user", content: `Merged\n\n${rewrite.prompt}` }]);
  });

  it("merges an explicit role that repeats the turn before it", () => {
    const node = { ...aiNode(graph, "rewrite"), role: "user" as const, prompt: "" };
    const request = buildStepRequest(node, "Merged", undefined, context, new Map());
    expect(request?.messages).toEqual([{ role: "user", content: "Request\n\nMerged" }]);
  });
});

describe("mergeSameRoleTurns", () => {
  it("keeps parts when a turn is not text only", () => {
    const merged = mergeSameRoleTurns([
      { role: "user", content: "a" },
      { role: "user", content: [{ type: "image", image: "data:x" }] },
      { role: "assistant", content: "b" },
    ]);
    expect(merged).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "a" },
          { type: "image", image: "data:x" },
        ],
      },
      { role: "assistant", content: "b" },
    ]);
  });
});

describe("planWorkflowRerun", () => {
  it("does not run steps whose output only feeds kept steps", () => {
    const graph = resolvedGraph();
    // A step added since the run, feeding the kept draft's Merge only.
    const extra = { ...aiNode(graph, "review"), id: "extra", key: "extra" };
    graph.nodes.push(extra);
    graph.edges.push({ id: "input->extra", source: "input", target: "extra" });
    graph.edges.push({ id: "extra->merge", source: "extra", target: "merge" });
    const done = (nodeId: string): WorkflowStepState => ({ nodeId, status: "done", output: "" });
    const source = new Map(
      ["draft", "review", "merge", "rewrite"].map((id) => [id, done(id)] as const),
    );

    const fromRewrite = planWorkflowRerun(graph, "rewrite", source);
    expect(fromRewrite.rerun).toEqual(new Set(["rewrite", "output"]));
    expect(fromRewrite.reused).toEqual(new Set(["draft", "review", "merge"]));
    expect(fromRewrite.skipped).toEqual(new Set(["extra"]));

    // Rerunning the Merge needs every input again, so the new step runs too.
    const fromMerge = planWorkflowRerun(graph, "merge", source);
    expect(fromMerge.skipped.size).toBe(0);
  });

  it("runs a step that failed before when Output still needs it", () => {
    const graph = resolvedGraph();
    const source = new Map<string, WorkflowStepState>([
      ["draft", { nodeId: "draft", status: "done", output: "" }],
      ["review", { nodeId: "review", status: "error", output: "" }],
    ]);
    const plan = planWorkflowRerun(graph, "review", source);
    expect(plan.reused).toEqual(new Set(["draft"]));
    expect(plan.skipped.size).toBe(0);
  });
});
