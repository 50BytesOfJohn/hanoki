import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
} from "ai";

import type { ChatMessageMetadata, HanokiUiMessage } from "@shared/chat/message-metadata";
import type { ChatCostUpdatedEvent } from "@shared/events";
import type { ReasoningEffort } from "@shared/models/reasoning";
import { createUuidV7 } from "@shared/uuidv7";
import { getMainPath, type WorkflowGraph, type WorkflowModelRef } from "@shared/workflow/graph";
import { buildWorkflowMessageParts } from "@shared/workflow/message-parts";
import {
  findUnavailableWorkflowSteps,
  formatUnavailableStepsMessage,
  formatWorkflowGraphError,
  getStepPinnedModel,
  getWorkflowModelUnavailableReason,
  type WorkflowModelUnavailableReason,
} from "@shared/workflow/model-availability";
import {
  getStepPartId,
  getWorkflowRun,
  getWorkflowSteps,
  planWorkflowRerun,
  selectWorkflowOutput,
  type WorkflowRequest,
  type WorkflowRunState,
  type WorkflowStepState,
} from "@shared/workflow/run";

import { addChatResponseCost, getWorkflowById, type ChatRow } from "../../chat-tree/repository";
import { getMessageById } from "../../messages/repository";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { beginChatGeneration, endChatGeneration } from "../chat-generation-gate";
import { persistGeneratedAssistantMessage } from "../chat-message-persistence";
import { toModelMessages } from "../chat-model-messages";
import { getChatStreamErrorMessage } from "../chat-stream-error";
import { runWorkflow } from "./run-workflow";
import {
  createWorkflowModelCaller,
  getWorkflowRetryDelay,
  getWorkflowStepErrorMessage,
} from "./workflow-model-call";
import { registerWorkflowRun } from "./workflow-runs";

const STEP_WRITE_INTERVAL_MS = 80;

interface WorkflowSetup {
  workflowId: string | null;
  name: string;
  graph: WorkflowGraph;
  reused: Map<string, WorkflowStepState>;
  /** Steps a rerun leaves out: nothing would read their output. */
  skipped: Set<string>;
  /** Models of reused steps, as they ran. */
  reusedModels: Map<string, WorkflowModelRef | null>;
  rerunFrom?: WorkflowRunState["rerunFrom"];
}

type ResolveWorkflowSetupResult = { ok: true; setup: WorkflowSetup } | { ok: false; error: string };

/**
 * Which workflow a request runs. A rerun keeps every step that does not
 * depend on the chosen one and runs the rest with the workflow as it is now,
 * so editing a prompt and rerunning from that step picks up the edit. If the
 * workflow was deleted, the run's own snapshot is rerun.
 */
export function resolveWorkflowSetup({
  chat,
  request,
  responseParentId,
}: {
  chat: ChatRow;
  request: WorkflowRequest;
  responseParentId: string | null;
}): ResolveWorkflowSetupResult {
  if (request.rerun) {
    const source = getMessageById(request.rerun.sourceMessageId);
    // SAFETY: stored message parts are UI message parts; this only reads the workflow ones.
    const sourceMessage = source ? { parts: source.parts as HanokiUiMessage["parts"] } : null;
    const sourceRun = sourceMessage ? getWorkflowRun(sourceMessage) : null;
    if (
      !source ||
      !sourceMessage ||
      !sourceRun ||
      source.chatId !== chat.id ||
      source.role !== "assistant" ||
      source.parentId !== responseParentId
    ) {
      return { ok: false, error: "That workflow run is not part of this conversation." };
    }

    const workflow = sourceRun.workflowId ? getWorkflowById(sourceRun.workflowId) : null;
    const nodeId = request.rerun.nodeId;
    // A workflow that can't be read has no nodes, so its run's own snapshot is used.
    const useCurrent = workflow?.data.graph.nodes.some((node) => node.id === nodeId) ?? false;
    const graph = useCurrent ? workflow!.data.graph : sourceRun.graph;
    if (!graph.nodes.some((node) => node.id === nodeId)) {
      return { ok: false, error: "That step is no longer part of the workflow." };
    }

    const sourceSteps = getWorkflowSteps(sourceMessage);
    const plan = planWorkflowRerun(graph, nodeId, sourceSteps);
    const reused = new Map<string, WorkflowStepState>();
    const reusedModels = new Map<string, WorkflowModelRef | null>();
    for (const id of plan.reused) {
      reused.set(id, sourceSteps.get(id)!);
      const ranWith = sourceRun.graph.nodes.find((candidate) => candidate.id === id);
      reusedModels.set(id, ranWith?.type === "ai" ? ranWith.model : null);
    }

    return checkStepModels(chat, {
      workflowId: useCurrent ? workflow!.id : sourceRun.workflowId,
      name: useCurrent ? workflow!.title : sourceRun.name,
      graph,
      reused,
      skipped: plan.skipped,
      reusedModels,
      rerunFrom: { sourceMessageId: source.id, nodeId },
    });
  }

  const workflowId = request.workflowId ?? chat.data.settings.workflowId;
  const workflow = workflowId ? getWorkflowById(workflowId) : null;
  if (!workflow || workflow.workspaceId !== chat.workspaceId) {
    return { ok: false, error: "This chat's workflow no longer exists. Pick another one." };
  }
  if (workflow.data.graphError) {
    return { ok: false, error: formatWorkflowGraphError(workflow.title) };
  }
  return checkStepModels(chat, {
    workflowId: workflow.id,
    name: workflow.title,
    graph: workflow.data.graph,
    reused: new Map(),
    skipped: new Set(),
    reusedModels: new Map(),
  });
}

/**
 * A run must not start while a step that would call a model points at one
 * that can't run, so the request fails before the user's message is stored.
 * Steps a rerun keeps don't call a model; steps on the chat's model are
 * covered by the chat's own model check.
 */
function checkStepModels(chat: ChatRow, setup: WorkflowSetup): ResolveWorkflowSetupResult {
  const unavailable = findUnavailableWorkflowSteps({
    graph: setup.graph,
    overrides: setup.workflowId
      ? chat.data.settings.workflowModelOverrides?.[setup.workflowId]
      : undefined,
    skip: new Set([...setup.reused.keys(), ...setup.skipped]),
    getReason: getStoredModelUnavailableReason,
  });
  if (unavailable.length > 0) {
    return { ok: false, error: formatUnavailableStepsMessage(unavailable) };
  }
  return { ok: true, setup };
}

function getStoredModelUnavailableReason(modelId: string): WorkflowModelUnavailableReason | null {
  const model = getModelById(modelId);
  return getWorkflowModelUnavailableReason(
    model && {
      isEnabled: model.isEnabled,
      status: model.lifecycleStatus,
      hasProvider: getProviderById(model.providerId) !== null,
    },
  );
}

/** The graph as it will run: every AI step's model resolved (chat override → step → chat model). */
function resolveRunGraph(
  setup: WorkflowSetup,
  chat: ChatRow,
  chatModel: WorkflowModelRef,
): WorkflowGraph {
  const overrides = setup.workflowId
    ? chat.data.settings.workflowModelOverrides?.[setup.workflowId]
    : undefined;
  return {
    edges: setup.graph.edges,
    nodes: setup.graph.nodes.map((node) => {
      if (node.type !== "ai") return node;
      const model = setup.reused.has(node.id)
        ? (setup.reusedModels.get(node.id) ?? null)
        : (getStepPinnedModel(node, overrides?.[node.id]) ?? chatModel);
      return { ...node, model };
    }),
  };
}

export function handleWorkflowChatRequest({
  chat,
  setup,
  messages,
  responseParentId,
  chatModel,
  temperature,
  getModelIdToSave,
  abortSignal,
  onChatCostUpdated,
}: {
  chat: ChatRow;
  setup: WorkflowSetup;
  messages: HanokiUiMessage[];
  responseParentId: string | null;
  chatModel: { id: string; reasoningEffort: ReasoningEffort | null; provider: string };
  temperature: number | undefined;
  getModelIdToSave: () => string | undefined;
  abortSignal: AbortSignal;
  onChatCostUpdated?: (event: Omit<ChatCostUpdatedEvent, "type">) => void;
}): Response {
  // The client gave up before the run started (e.g. stopped at once): nothing
  // runs, nothing is paid for, and nothing is saved.
  if (abortSignal.aborted) return new Response(null, { status: 204 });

  const runId = createUuidV7();
  const messageId = createUuidV7();
  const startedAt = Date.now();
  const graph = resolveRunGraph(setup, chat, {
    modelId: chatModel.id,
    reasoningEffort: chatModel.reasoningEffort,
  });
  const controller = new AbortController();
  const unregister = registerWorkflowRun(chat.id, controller);
  const abortFromRequest = () => controller.abort();
  abortSignal.addEventListener("abort", abortFromRequest, { once: true });
  const initialMetadata = { parentId: responseParentId, provider: chatModel.provider };

  let run: WorkflowRunState = {
    runId,
    workflowId: setup.workflowId,
    name: setup.name,
    status: "running",
    graph,
    outputNodeId: null,
    ...(setup.rerunFrom ? { rerunFrom: setup.rerunFrom } : {}),
    startedAt,
  };

  const stream = createUIMessageStream<HanokiUiMessage>({
    execute: async ({ writer }) => {
      beginChatGeneration(chat.id);
      try {
        writer.write({ type: "start", messageId, messageMetadata: initialMetadata });
        writer.write({ type: "data-workflowRun", id: runId, data: run });

        const steps = createThrottledStepWriter((state) => {
          writer.write({
            type: "data-workflowStep",
            id: getStepPartId(runId, state.nodeId),
            data: state,
          });
        });

        const context = await toModelMessages(messages);
        const states = await runWorkflow({
          graph,
          input: getLatestUserText(context),
          context: { messages: context, instructions: chat.data.settings.systemPrompt?.trim() },
          reused: setup.reused,
          skip: setup.skipped,
          signal: controller.signal,
          callModel: createWorkflowModelCaller(temperature),
          getRetryDelay: getWorkflowRetryDelay,
          formatError: getWorkflowStepErrorMessage,
          onStep: steps.push,
        });
        steps.flush();

        const output = selectWorkflowOutput(graph, states);
        const reachedOutput = output !== null && output.nodeId === getMainPath(graph)[1]?.id;
        run = {
          ...run,
          status: reachedOutput ? "done" : controller.signal.aborted ? "stopped" : "error",
          outputNodeId: output?.nodeId ?? null,
          endedAt: Date.now(),
        };
        writer.write({ type: "data-workflowRun", id: runId, data: run });
        if (output?.text.trim()) {
          writer.write({ type: "text-start", id: runId });
          writer.write({ type: "text-delta", id: runId, delta: output.text });
          writer.write({ type: "text-end", id: runId });
        }

        const metadata = buildRunMetadata(graph, states, run, output?.nodeId ?? null);
        const calledModel = [...states.values()].some(
          (state) => state.modelId && !state.reused && state.status !== "pending",
        );
        if (calledModel) {
          const chatCost = addChatResponseCost(chat.id, metadata.cost);
          if (chatCost) onChatCostUpdated?.({ chatId: chat.id, cost: chatCost });
        }
        // The run message was shown from the first write, so it is always kept,
        // even when no step ran (stopped at once, or Input wired straight to
        // Output). Stored before the stream ends, so the client's reload finds it.
        persistGeneratedAssistantMessage({
          chatId: chat.id,
          message: {
            id: messageId,
            role: "assistant",
            parts: buildWorkflowMessageParts(run, states.values(), output?.text ?? null),
            metadata: { parentId: responseParentId },
          },
          fallbackParentId: responseParentId,
          responseMetadata: metadata,
          modelId: getModelIdToSave(),
        });
        writer.write({
          type: "finish",
          finishReason: run.status === "done" ? "stop" : "other",
          messageMetadata: { parentId: responseParentId, ...metadata },
        });
      } finally {
        endChatGeneration(chat.id);
        unregister();
        abortSignal.removeEventListener("abort", abortFromRequest);
      }
    },
    onError: (error) => {
      console.error("[workflow] Run failed.", { chatId: chat.id, runId }, error);
      return getChatStreamErrorMessage(error);
    },
  });

  console.info("[workflow] Run started.", {
    chatId: chat.id,
    runId,
    workflowId: setup.workflowId,
    rerunFrom: setup.rerunFrom?.nodeId ?? null,
    reusedSteps: setup.reused.size,
  });

  return createUIMessageStreamResponse({ stream, consumeSseStream: consumeStream });
}

function getLatestUserText(messages: readonly ModelMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    return message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n");
  }
  return "";
}

/**
 * Totals for the message: tokens and cost of every step that ran in this run
 * (reused steps were paid for by the run they came from). The model is the
 * one that wrote the message text.
 */
function buildRunMetadata(
  graph: WorkflowGraph,
  states: ReadonlyMap<string, WorkflowStepState>,
  run: WorkflowRunState,
  outputNodeId: string | null,
): Omit<ChatMessageMetadata, "parentId"> {
  let input = 0;
  let output = 0;
  let cost: { total: number; currency: string } | undefined;
  for (const state of states.values()) {
    if (state.reused) continue;
    input += state.tokens?.input ?? 0;
    output += state.tokens?.output ?? 0;
    if (state.cost?.total !== undefined && (!cost || cost.currency === state.cost.currency)) {
      cost = { total: (cost?.total ?? 0) + state.cost.total, currency: state.cost.currency };
    }
  }

  const outputState = outputNodeId ? states.get(outputNodeId) : undefined;
  const outputNode = graph.nodes.find((node) => node.id === outputNodeId);
  const model = outputState?.modelId ? getModelById(outputState.modelId) : undefined;
  const provider = model ? getProviderById(model.providerId)?.catalogId : undefined;
  return {
    ...(input + output > 0 ? { tokens: { input, output, total: input + output } } : {}),
    ...(outputNode?.type === "ai" && outputNode.includeContext && outputState?.tokens
      ? { contextUsage: { ...outputState.tokens } }
      : {}),
    ...(cost ? { cost } : {}),
    times: { generation: (run.endedAt ?? Date.now()) - run.startedAt },
    ...(provider ? { provider } : {}),
    ...(model ? { model: model.id } : {}),
    finishReason: run.status === "done" ? "stop" : run.status,
  };
}

/**
 * Status changes go out at once; a streaming step's growing text at most every
 * `STEP_WRITE_INTERVAL_MS`, since each write resends the step's whole output.
 */
function createThrottledStepWriter(write: (state: WorkflowStepState) => void) {
  const written = new Map<string, WorkflowStepState>();
  const pending = new Map<string, WorkflowStepState>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const send = (state: WorkflowStepState) => {
    const timer = timers.get(state.nodeId);
    if (timer) clearTimeout(timer);
    timers.delete(state.nodeId);
    pending.delete(state.nodeId);
    written.set(state.nodeId, state);
    write(state);
  };

  return {
    push: (state: WorkflowStepState) => {
      const previous = written.get(state.nodeId);
      if (!previous || previous.status !== state.status) {
        send(state);
        return;
      }
      pending.set(state.nodeId, state);
      if (!timers.has(state.nodeId)) {
        timers.set(
          state.nodeId,
          setTimeout(() => {
            const latest = pending.get(state.nodeId);
            timers.delete(state.nodeId);
            if (latest) send(latest);
          }, STEP_WRITE_INTERVAL_MS),
        );
      }
    },
    flush: () => {
      // Deleting the entry being visited is safe while iterating a Map.
      for (const state of pending.values()) send(state);
    },
  };
}
