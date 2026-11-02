import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSettings } from "@shared/ipc";
import {
  createDefaultWorkflowGraph,
  type WorkflowAiNode,
  type WorkflowGraph,
} from "@shared/workflow/graph";
import type { WorkflowRunState, WorkflowStepState } from "@shared/workflow/run";

import type { ChatRow, WorkflowRow } from "../../chat-tree/repository";
import { handleWorkflowChatRequest, resolveWorkflowSetup } from "./chat-workflow";

interface FakeModel {
  id: string;
  providerId: string;
  isEnabled: boolean;
  lifecycleStatus: string;
}

const store = vi.hoisted(() => ({
  workflows: new Map<string, unknown>(),
  messages: new Map<string, unknown>(),
  models: new Map<string, unknown>(),
  providers: new Set<string>(),
}));

vi.mock("../../chat-tree/repository", () => ({
  getWorkflowById: (id: string) => store.workflows.get(id) ?? null,
  addChatResponseCost: vi.fn(),
}));
vi.mock("../../messages/repository", () => ({
  getMessageById: (id: string) => store.messages.get(id) ?? null,
}));
vi.mock("../../models/repository", () => ({
  getModelById: (id: string) => store.models.get(id),
}));
vi.mock("../../providers/repository", () => ({
  getProviderById: (id: string) => (store.providers.has(id) ? { id, catalogId: "openai" } : null),
}));

function addModel(model: Partial<FakeModel> & { id: string }) {
  store.models.set(model.id, {
    providerId: "provider",
    isEnabled: true,
    lifecycleStatus: "active",
    ...model,
  });
}

function aiSteps(graph: WorkflowGraph): [WorkflowAiNode, WorkflowAiNode, WorkflowAiNode] {
  // SAFETY: the default graph has three AI steps: draft, review, rewrite.
  return graph.nodes.filter((node) => node.type === "ai") as [
    WorkflowAiNode,
    WorkflowAiNode,
    WorkflowAiNode,
  ];
}

function addWorkflow(graph: WorkflowGraph): WorkflowRow {
  // SAFETY: only the fields `resolveWorkflowSetup` reads.
  const workflow = {
    type: "workflow",
    id: "workflow",
    workspaceId: "workspace",
    title: "Review flow",
    data: { graph },
  } as unknown as WorkflowRow;
  store.workflows.set(workflow.id, workflow);
  return workflow;
}

function createChat(settings: ChatSettings = {}): ChatRow {
  // SAFETY: only the fields `resolveWorkflowSetup` reads.
  return {
    type: "chat",
    id: "chat",
    workspaceId: "workspace",
    data: { settings: { workflowId: "workflow", ...settings } },
  } as unknown as ChatRow;
}

const ref = (modelId: string) => ({ modelId, reasoningEffort: null });

beforeEach(() => {
  store.workflows.clear();
  store.messages.clear();
  store.models.clear();
  store.providers.clear();
  store.providers.add("provider");
  addModel({ id: "provider:ok" });
});

describe("resolveWorkflowSetup", () => {
  it("refuses a workflow whose stored graph can't be read", () => {
    const workflow = addWorkflow({ nodes: [], edges: [] });
    workflow.data.graphError = "nodes must be an array";
    const result = resolveWorkflowSetup({ chat: createChat(), request: {}, responseParentId: "u" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("can't be read") });
  });
});

describe("handleWorkflowChatRequest", () => {
  it("runs nothing when the request was already aborted", () => {
    const graph = createDefaultWorkflowGraph();
    addWorkflow(graph);
    const setup = resolveWorkflowSetup({ chat: createChat(), request: {}, responseParentId: "u" });
    if (!setup.ok) throw new Error(setup.error);
    const controller = new AbortController();
    controller.abort();
    const getModelIdToSave = vi.fn(() => undefined);

    const response = handleWorkflowChatRequest({
      chat: createChat(),
      setup: setup.setup,
      messages: [],
      responseParentId: "u",
      chatModel: { id: "provider:ok", reasoningEffort: null, provider: "openai" },
      temperature: undefined,
      getModelIdToSave,
      abortSignal: controller.signal,
    });
    expect(response.status).toBe(204);
    expect(getModelIdToSave).not.toHaveBeenCalled();
  });
});

describe("resolveWorkflowSetup model check", () => {
  it("runs when every step's model can run", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review] = aiSteps(graph);
    draft.model = null;
    review.model = ref("provider:ok");
    addWorkflow(graph);

    const result = resolveWorkflowSetup({ chat: createChat(), request: {}, responseParentId: "u" });
    expect(result.ok).toBe(true);
  });

  it("names a step whose model was removed", () => {
    const graph = createDefaultWorkflowGraph();
    const [, review] = aiSteps(graph);
    review.model = ref("provider:gone");
    addWorkflow(graph);

    expect(
      resolveWorkflowSetup({ chat: createChat(), request: {}, responseParentId: "u" }),
    ).toEqual({
      ok: false,
      error: `Pick a new model for “${review.name}”: its model was removed.`,
    });
  });

  it("treats a retired model, a deleted provider and a turned-off model as unavailable", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review, rewrite] = aiSteps(graph);
    addModel({ id: "provider:retired", lifecycleStatus: "removed" });
    addModel({ id: "orphan:model", providerId: "orphan" });
    addModel({ id: "provider:off", isEnabled: false });
    draft.model = ref("provider:retired");
    review.model = ref("orphan:model");
    rewrite.model = ref("provider:off");
    addWorkflow(graph);

    const result = resolveWorkflowSetup({ chat: createChat(), request: {}, responseParentId: "u" });
    expect(result).toEqual({
      ok: false,
      error: `Pick new models for “${draft.name}”, “${review.name}” and “${rewrite.name}”: their models were removed or turned off.`,
    });
  });

  it("checks the chat's overrides over the step's own model", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review] = aiSteps(graph);
    review.model = ref("provider:gone");
    addWorkflow(graph);

    const fixed = createChat({
      workflowModelOverrides: { workflow: { [review.id]: ref("provider:ok") } },
    });
    expect(resolveWorkflowSetup({ chat: fixed, request: {}, responseParentId: "u" }).ok).toBe(true);

    const onChatModel = createChat({
      workflowModelOverrides: { workflow: { [review.id]: "chat" } },
    });
    expect(resolveWorkflowSetup({ chat: onChatModel, request: {}, responseParentId: "u" }).ok).toBe(
      true,
    );

    const broken = createChat({
      workflowModelOverrides: { workflow: { [review.id]: "chat", [draft.id]: ref("provider:x") } },
    });
    expect(resolveWorkflowSetup({ chat: broken, request: {}, responseParentId: "u" })).toEqual({
      ok: false,
      error: `Pick a new model for “${draft.name}”: its model was removed.`,
    });
  });

  it("ignores disabled steps", () => {
    const graph = createDefaultWorkflowGraph();
    const [, review] = aiSteps(graph);
    review.model = ref("provider:gone");
    review.disabled = true;
    addWorkflow(graph);

    expect(
      resolveWorkflowSetup({ chat: createChat(), request: {}, responseParentId: "u" }).ok,
    ).toBe(true);
  });

  it("lets a rerun keep steps whose model was removed, but not rerun them", () => {
    const graph = createDefaultWorkflowGraph();
    const [draft, review, rewrite] = aiSteps(graph);
    draft.model = ref("provider:gone");
    review.model = ref("provider:ok");
    rewrite.model = ref("provider:ok");
    addWorkflow(graph);

    const run: WorkflowRunState = {
      runId: "run",
      workflowId: "workflow",
      name: "Review flow",
      status: "done",
      graph,
      outputNodeId: rewrite.id,
      startedAt: 0,
    };
    const done = (nodeId: string): WorkflowStepState => ({ nodeId, status: "done", output: "x" });
    store.messages.set("source", {
      id: "source",
      chatId: "chat",
      role: "assistant",
      parentId: "u",
      parts: [
        { type: "data-workflowRun", id: "run", data: run },
        ...[draft.id, review.id, rewrite.id].map((nodeId) => ({
          type: "data-workflowStep",
          id: `run:${nodeId}`,
          data: done(nodeId),
        })),
      ],
    });

    const fromReview = resolveWorkflowSetup({
      chat: createChat(),
      request: { rerun: { sourceMessageId: "source", nodeId: review.id } },
      responseParentId: "u",
    });
    expect(fromReview.ok).toBe(true);

    const fromDraft = resolveWorkflowSetup({
      chat: createChat(),
      request: { rerun: { sourceMessageId: "source", nodeId: draft.id } },
      responseParentId: "u",
    });
    expect(fromDraft).toEqual({
      ok: false,
      error: `Pick a new model for “${draft.name}”: its model was removed.`,
    });
  });
});
