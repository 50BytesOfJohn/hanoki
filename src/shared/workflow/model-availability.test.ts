import { describe, expect, it } from "vitest";

import { createDefaultWorkflowGraph, type WorkflowAiNode, type WorkflowGraph } from "./graph";
import {
  findUnavailableWorkflowSteps,
  formatUnavailableStepsMessage,
  getProviderModelIdFromModelId,
  getStepPinnedModel,
  getWorkflowModelUnavailableReason,
  type WorkflowModelUnavailableReason,
} from "./model-availability";

const ref = (modelId: string) => ({ modelId, reasoningEffort: null });

function aiSteps(graph: WorkflowGraph): WorkflowAiNode[] {
  return graph.nodes.filter((node): node is WorkflowAiNode => node.type === "ai");
}

describe("getWorkflowModelUnavailableReason", () => {
  it("accepts an enabled, active model whose provider exists", () => {
    expect(getWorkflowModelUnavailableReason({ isEnabled: true, status: "active" })).toBeNull();
    expect(
      getWorkflowModelUnavailableReason({ isEnabled: true, status: "active", hasProvider: true }),
    ).toBeNull();
  });

  it("calls a missing, retired or orphaned model removed", () => {
    expect(getWorkflowModelUnavailableReason(undefined)).toBe("removed");
    expect(getWorkflowModelUnavailableReason(null)).toBe("removed");
    expect(getWorkflowModelUnavailableReason({ isEnabled: true, status: "deprecated" })).toBe(
      "removed",
    );
    expect(getWorkflowModelUnavailableReason({ isEnabled: true, status: "removed" })).toBe(
      "removed",
    );
    expect(
      getWorkflowModelUnavailableReason({ isEnabled: true, status: "active", hasProvider: false }),
    ).toBe("removed");
  });

  it("calls an existing model that is turned off disabled", () => {
    expect(getWorkflowModelUnavailableReason({ isEnabled: false, status: "active" })).toBe(
      "disabled",
    );
    // Gone wins over turned off.
    expect(getWorkflowModelUnavailableReason({ isEnabled: false, status: "removed" })).toBe(
      "removed",
    );
  });
});

describe("getStepPinnedModel", () => {
  it("prefers the chat's override, then the step's model", () => {
    expect(getStepPinnedModel({ model: ref("a") }, ref("b"))).toEqual(ref("b"));
    expect(getStepPinnedModel({ model: ref("a") }, undefined)).toEqual(ref("a"));
    expect(getStepPinnedModel({ model: ref("a") }, "chat")).toBeNull();
    expect(getStepPinnedModel({ model: null }, null)).toBeNull();
  });
});

describe("findUnavailableWorkflowSteps", () => {
  const reasons: Record<string, WorkflowModelUnavailableReason> = {
    gone: "removed",
    off: "disabled",
  };
  const getReason = (modelId: string) => reasons[modelId] ?? null;

  it("finds enabled AI steps pinned to a model that can't run", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review, rewrite] = aiSteps(graph) as [
      WorkflowAiNode,
      WorkflowAiNode,
      WorkflowAiNode,
    ];
    draft.model = null;
    review.model = ref("gone");
    rewrite.model = ref("ok");

    expect(findUnavailableWorkflowSteps({ graph, getReason })).toEqual([
      { nodeId: review.id, name: review.name, modelId: "gone", reason: "removed" },
    ]);
  });

  it("follows the chat's overrides", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review] = aiSteps(graph) as [WorkflowAiNode, WorkflowAiNode];
    review.model = ref("gone");

    expect(
      findUnavailableWorkflowSteps({
        graph,
        overrides: { [review.id]: ref("ok"), [draft.id]: ref("off") },
        getReason,
      }).map((step) => [step.nodeId, step.reason]),
    ).toEqual([[draft.id, "disabled"]]);
    expect(
      findUnavailableWorkflowSteps({ graph, overrides: { [review.id]: "chat" }, getReason }),
    ).toEqual([]);
  });

  it("ignores disabled steps and steps that won't call a model", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review] = aiSteps(graph) as [WorkflowAiNode, WorkflowAiNode];
    draft.model = ref("gone");
    draft.disabled = true;
    review.model = ref("gone");

    expect(findUnavailableWorkflowSteps({ graph, skip: new Set([review.id]), getReason })).toEqual(
      [],
    );
  });
});

describe("formatUnavailableStepsMessage", () => {
  const step = (name: string, reason: WorkflowModelUnavailableReason) => ({
    nodeId: name,
    name,
    modelId: name,
    reason,
  });

  it("names the steps and why", () => {
    expect(formatUnavailableStepsMessage([step("Review", "removed")])).toBe(
      "Pick a new model for “Review”: its model was removed.",
    );
    expect(formatUnavailableStepsMessage([step("Review", "disabled")])).toBe(
      "Pick a new model for “Review”: its model is turned off.",
    );
    expect(
      formatUnavailableStepsMessage([step("Draft", "removed"), step("Review", "removed")]),
    ).toBe("Pick new models for “Draft” and “Review”: their models were removed.");
    expect(
      formatUnavailableStepsMessage([
        step("Draft", "removed"),
        step("Review", "disabled"),
        step("Rewrite", "removed"),
      ]),
    ).toBe(
      "Pick new models for “Draft”, “Review” and “Rewrite”: their models were removed or turned off.",
    );
  });
});

describe("getProviderModelIdFromModelId", () => {
  it("drops the provider prefix", () => {
    expect(getProviderModelIdFromModelId("provider-1:openai/gpt-4o")).toBe("openai/gpt-4o");
    expect(getProviderModelIdFromModelId("a:b:c")).toBe("b:c");
    expect(getProviderModelIdFromModelId("plain")).toBe("plain");
  });
});
