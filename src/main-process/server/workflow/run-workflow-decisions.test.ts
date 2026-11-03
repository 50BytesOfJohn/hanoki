import { describe, expect, it } from "vitest";

import {
  createWorkflowAiNode,
  createWorkflowDecisionNode,
  createWorkflowEdge,
  createWorkflowMergeNode,
  parseWorkflowGraph,
  type WorkflowAiNode,
  type WorkflowDecisionNode,
  type WorkflowGraph,
} from "@shared/workflow/graph";
import { selectWorkflowOutput, type WorkflowStepState } from "@shared/workflow/run";

import {
  runWorkflow,
  type RunWorkflowOptions,
  type WorkflowDecisionCall,
  type WorkflowModelCall,
} from "./run-workflow";
import { parseTextDecision } from "./workflow-model-call";

const MODEL = { modelId: "model-a", reasoningEffort: null };
const EMPTY: WorkflowGraph = { nodes: [], edges: [] };

function ai(id: string, patch: Partial<WorkflowAiNode> = {}): WorkflowAiNode {
  return {
    ...createWorkflowAiNode(EMPTY, { x: 0, y: 0 }, id),
    id,
    key: id,
    model: MODEL,
    ...patch,
  };
}

function decision(id: string, patch: Partial<WorkflowDecisionNode> = {}): WorkflowDecisionNode {
  return {
    ...createWorkflowDecisionNode(EMPTY, { x: 0, y: 0 }, id),
    id,
    key: id,
    model: MODEL,
    prompt: "Did it refuse?",
    ...patch,
  };
}

/** Input → Draft → Check; Yes (refused) loops back to Draft, No goes to Output. */
function retryGraph(check: Partial<WorkflowDecisionNode> = {}): WorkflowGraph {
  const graph: WorkflowGraph = {
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 0 } },
      ai("draft", { includeContext: true }),
      decision("check", check),
      { id: "output", type: "output", position: { x: 0, y: 0 } },
    ],
    edges: [
      createWorkflowEdge("input", "draft"),
      createWorkflowEdge("draft", "check"),
      createWorkflowEdge("check", "draft", { sourceHandle: "true", loop: true }),
      createWorkflowEdge("check", "output", { sourceHandle: "false" }),
    ],
  };
  expect(parseWorkflowGraph(graph)).toMatchObject({ ok: true });
  return graph;
}

function lastText(call: WorkflowDecisionCall | WorkflowModelCall): string {
  return call.messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
}

function run(options: Partial<RunWorkflowOptions> & Pick<RunWorkflowOptions, "graph">) {
  const updates: WorkflowStepState[] = [];
  const promise = runWorkflow({
    input: "Write a scene",
    context: { messages: [{ role: "user", content: "Write a scene" }], instructions: undefined },
    signal: new AbortController().signal,
    callModel: async (call) => {
      call.onText("text");
      return { modelId: call.model.modelId };
    },
    decide: async () => ({ modelId: MODEL.modelId, answer: false }),
    onStep: (state) => updates.push(state),
    ...options,
  });
  return { promise, updates };
}

/** The last state of each pass of a step, in order. */
function passes(updates: WorkflowStepState[], nodeId: string): WorkflowStepState[] {
  const byIteration = new Map<number, WorkflowStepState>();
  for (const state of updates) {
    if (state.nodeId === nodeId) byIteration.set(state.iteration ?? 1, state);
  }
  return [...byIteration.entries()].sort(([a], [b]) => a - b).map(([, state]) => state);
}

describe("runWorkflow decisions", () => {
  it("runs each pass a loop starts with the step's next model, starting over after the last", async () => {
    const graph = retryGraph({ maxLoops: 4, onLoopLimit: "continue" });
    graph.nodes = graph.nodes.map((node) =>
      node.id === "draft" && node.type === "ai"
        ? {
            ...node,
            passModels: [
              { modelId: "model-b", reasoningEffort: "low" },
              { modelId: "model-c", reasoningEffort: null },
            ],
          }
        : node,
    );
    expect(parseWorkflowGraph(graph)).toMatchObject({ ok: true });
    const called: string[] = [];
    const { promise, updates } = run({
      graph,
      callModel: async (call) => {
        called.push(`${call.model.modelId}/${call.model.reasoningEffort ?? "default"}`);
        call.onText("I can't write that.");
        return { modelId: call.model.modelId };
      },
      decide: async () => ({ modelId: MODEL.modelId, answer: true }),
    });
    await promise;

    expect(called).toEqual([
      "model-a/default",
      "model-b/low",
      "model-c/default",
      "model-a/default",
      "model-b/low",
    ]);
    expect(passes(updates, "draft").map((state) => state.modelId)).toEqual([
      "model-a",
      "model-b",
      "model-c",
      "model-a",
      "model-b",
    ]);
  });

  it("runs the steps again while the Decision loops, then goes on along the other branch", async () => {
    let drafts = 0;
    const { promise, updates } = run({
      graph: retryGraph(),
      callModel: async (call) => {
        drafts += 1;
        call.onText(drafts < 3 ? "I can't write that." : "The scene.");
        return { modelId: call.model.modelId };
      },
      decide: async (call) => {
        expect(lastText(call)).toContain("<draft>");
        expect(lastText(call)).toContain("Did it refuse?");
        const refused = lastText(call).includes("can't");
        return { modelId: MODEL.modelId, answer: refused, reason: refused ? "Refusal" : "Fine" };
      },
    });
    const states = await promise;

    expect(drafts).toBe(3);
    expect(states.get("draft")).toMatchObject({
      status: "done",
      output: "The scene.",
      iteration: 3,
    });
    expect(states.get("check")).toMatchObject({
      status: "done",
      output: "The scene.",
      decision: { answer: false, branch: "false", reason: "Fine" },
    });
    expect(passes(updates, "draft").map((state) => state.output)).toEqual([
      "I can't write that.",
      "I can't write that.",
      "The scene.",
    ]);
    expect(passes(updates, "check").map((state) => state.decision?.loop)).toEqual([
      { count: 1, max: 3 },
      { count: 2, max: 3 },
      undefined,
    ]);
    expect(selectWorkflowOutput(retryGraph(), states)).toMatchObject({
      nodeId: "draft",
      text: "The scene.",
      reachedOutput: true,
    });
  });

  it("stops the run when the loop limit is reached, keeping the last attempt", async () => {
    let drafts = 0;
    const { promise } = run({
      graph: retryGraph({ maxLoops: 2, onLoopLimit: "stop" }),
      callModel: async (call) => {
        drafts += 1;
        call.onText(`refusal ${drafts}`);
        return { modelId: call.model.modelId };
      },
      decide: async () => ({ modelId: MODEL.modelId, answer: true }),
    });
    const states = await promise;

    expect(drafts).toBe(3);
    expect(states.get("check")).toMatchObject({
      status: "error",
      decision: { limitReached: true, loop: { count: 2, max: 2 } },
    });
    expect(states.get("check")?.error).toContain("after looping 2 times");
    expect(selectWorkflowOutput(retryGraph(), states)).toMatchObject({
      nodeId: "draft",
      text: "refusal 3",
      reachedOutput: false,
    });
  });

  it("takes the other branch at the loop limit when set to continue", async () => {
    const { promise } = run({
      graph: retryGraph({ maxLoops: 1, onLoopLimit: "continue" }),
      decide: async () => ({ modelId: MODEL.modelId, answer: true }),
    });
    const states = await promise;
    expect(states.get("check")).toMatchObject({
      status: "done",
      decision: { answer: true, branch: "false", limitReached: true },
    });
    expect(states.get("draft")?.iteration).toBe(2);
  });

  it("runs only the branch the Decision answers; a Merge joins what ran", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: "input", type: "input", position: { x: 0, y: 0 } },
        decision("check", { prompt: "Is it a question?" }),
        ai("answer", { prompt: "Answer it." }),
        ai("reply", { prompt: "Reply to it." }),
        ai("after", { prompt: "Polish." }),
        { ...createWorkflowMergeNode(EMPTY, { x: 0, y: 0 }), id: "join", key: "join" },
        { id: "output", type: "output", position: { x: 0, y: 0 } },
      ],
      edges: [
        createWorkflowEdge("input", "check"),
        createWorkflowEdge("check", "answer", { sourceHandle: "true" }),
        createWorkflowEdge("answer", "after"),
        createWorkflowEdge("check", "reply", { sourceHandle: "false" }),
        createWorkflowEdge("after", "join"),
        createWorkflowEdge("reply", "join"),
        createWorkflowEdge("join", "output"),
      ],
    };
    expect(parseWorkflowGraph(graph)).toMatchObject({ ok: true });
    const called: string[] = [];
    const { promise } = run({
      graph,
      callModel: async (call) => {
        called.push(call.step.id);
        call.onText(`${call.step.id} text`);
        return { modelId: call.model.modelId };
      },
      decide: async () => ({ modelId: MODEL.modelId, answer: false }),
    });
    const states = await promise;

    expect(called).toEqual(["reply"]);
    expect(states.get("answer")?.status).toBe("inactive");
    expect(states.get("after")?.status).toBe("inactive");
    expect(states.get("join")).toMatchObject({ status: "done", output: "reply text" });
  });

  it("starts a side branch of the loop over, stopping the pass still writing", async () => {
    const graph = retryGraph({ maxLoops: 1 });
    graph.nodes.push(ai("note", { prompt: "Note something." }));
    graph.edges.push(createWorkflowEdge("draft", "note"));
    let decisions = 0;
    const { promise, updates } = run({
      graph,
      callModel: async (call) => {
        if (call.step.id === "note") {
          call.onText("partial");
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 30);
            call.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(call.signal.reason);
            });
          });
          return { modelId: call.model.modelId };
        }
        call.onText("draft");
        return { modelId: call.model.modelId };
      },
      decide: async () => {
        decisions += 1;
        return { modelId: MODEL.modelId, answer: decisions === 1 };
      },
    });
    const states = await promise;

    expect(passes(updates, "note").map((state) => state.status)).toEqual(["stopped", "done"]);
    expect(states.get("note")).toMatchObject({ status: "done", iteration: 2 });
  });

  it("lets a disabled Decision through along the branch that doesn't loop", async () => {
    let asked = false;
    const { promise } = run({
      graph: retryGraph({ disabled: true }),
      decide: async () => {
        asked = true;
        return { modelId: MODEL.modelId, answer: true };
      },
    });
    const states = await promise;
    expect(asked).toBe(false);
    expect(states.get("check")).toMatchObject({ status: "skipped", decision: { branch: "false" } });
  });

  it("fails a Decision without a question", async () => {
    const { promise } = run({ graph: retryGraph({ prompt: " " }) });
    const states = await promise;
    expect(states.get("check")).toMatchObject({ status: "error" });
  });
});

describe("runWorkflow retries", () => {
  function single(patch: Partial<WorkflowAiNode>): WorkflowGraph {
    return {
      nodes: [
        { id: "input", type: "input", position: { x: 0, y: 0 } },
        ai("draft", { includeContext: true, ...patch }),
        { id: "output", type: "output", position: { x: 0, y: 0 } },
      ],
      edges: [createWorkflowEdge("input", "draft"), createWorkflowEdge("draft", "output")],
    };
  }

  it("tries a failed step again as often as its retries allow", async () => {
    let calls = 0;
    const { promise } = run({
      graph: single({ retries: 2 }),
      callModel: async (call) => {
        calls += 1;
        if (calls === 1) throw new Error("Bad gateway");
        call.onText(calls === 2 ? "  " : "fine");
        return { modelId: call.model.modelId };
      },
    });
    const states = await promise;
    expect(calls).toBe(3);
    expect(states.get("draft")).toMatchObject({
      status: "done",
      output: "fine",
      attempt: 3,
      retriedErrors: ["Bad gateway", "The model replied with no text."],
    });
  });

  it("drops a partial reply before trying again", async () => {
    let calls = 0;
    const { promise } = run({
      graph: single({ retries: 1 }),
      callModel: async (call) => {
        calls += 1;
        call.onText(calls === 1 ? "half a" : "whole");
        if (calls === 1) throw new Error("Connection reset");
        return { modelId: call.model.modelId };
      },
    });
    expect((await promise).get("draft")).toMatchObject({ status: "done", output: "whole" });
  });

  it("fails once the retries run out", async () => {
    let calls = 0;
    const { promise } = run({
      graph: single({ retries: 1 }),
      callModel: async () => {
        calls += 1;
        throw new Error("Nope");
      },
    });
    const states = await promise;
    expect(calls).toBe(2);
    expect(states.get("draft")).toMatchObject({ status: "error", error: "Nope", attempt: 2 });
  });

  it("retries a Decision whose answer can't be read", async () => {
    let calls = 0;
    const { promise } = run({
      graph: retryGraph({ retries: 1 }),
      decide: async () => {
        calls += 1;
        if (calls === 1) throw new Error("The model's answer wasn't yes or no");
        return { modelId: MODEL.modelId, answer: false };
      },
    });
    expect((await promise).get("check")).toMatchObject({ status: "done", attempt: 2 });
  });
});

describe("parseTextDecision", () => {
  it("reads yes or no and the reason after it", () => {
    expect(parseTextDecision("YES\nThe model apologised and declined.")).toEqual({
      answer: true,
      reason: "The model apologised and declined.",
    });
    expect(parseTextDecision("**No.** It wrote the scene.")).toEqual({
      answer: false,
      reason: "It wrote the scene.",
    });
    expect(parseTextDecision("<think>yes? no...</think>\nNo")).toEqual({ answer: false });
    expect(parseTextDecision("Maybe")).toBeNull();
  });
});
