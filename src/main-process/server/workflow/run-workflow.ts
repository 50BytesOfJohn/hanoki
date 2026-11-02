import type { ModelMessage } from "ai";

import {
  getAncestorIds,
  getFailureMode,
  getIncomingMap,
  isStepNode,
  renderTemplate,
  type WorkflowAiNode,
  type WorkflowGraph,
  type WorkflowMergeNode,
  type WorkflowModelRef,
  type WorkflowNode,
} from "@shared/workflow/graph";
import type { WorkflowStepState } from "@shared/workflow/run";
import { buildStepRequest, type StepContext } from "@shared/workflow/step-request";

export interface WorkflowModelCall {
  step: { id: string; name: string };
  model: WorkflowModelRef;
  system: string | undefined;
  messages: ModelMessage[];
  signal: AbortSignal;
  onText: (delta: string) => void;
}

export interface WorkflowModelResult {
  modelId: string;
  tokens?: WorkflowStepState["tokens"];
  cost?: WorkflowStepState["cost"];
}

export interface RunWorkflowOptions {
  /** Every AI step's `model` is already resolved to what it should run with. */
  graph: WorkflowGraph;
  /** The request's text, as the Input step's output. */
  input: string;
  /** What "Include context" adds: the chat history and the chat's instructions. */
  context: StepContext;
  /** Steps carried over from an earlier run; they are not run again. */
  reused?: ReadonlyMap<string, WorkflowStepState>;
  /** Steps a rerun leaves out because nothing reads their output; they stay pending. */
  skip?: ReadonlySet<string>;
  signal: AbortSignal;
  callModel: (call: WorkflowModelCall) => Promise<WorkflowModelResult>;
  /** Decides whether a failed call is a provider limit worth waiting out, and for how long. */
  getRetryDelay?: (error: unknown, attempt: number) => number | null;
  formatError?: (error: unknown) => string;
  /** Called with every change to a step; `output` grows while a step streams. */
  onStep: (state: WorkflowStepState) => void;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Runs every step as soon as the steps it reads from have finished, so
 * branches fanning out of one step run at the same time. A step whose input
 * failed or was stopped does not run and stays `pending`.
 *
 * An AI step fails when its call errors or its reply has no text. Unless the
 * step is set to continue, that ends the run: steps still writing are stopped
 * and nothing else starts. A step set to continue is `error` with `continued`,
 * and the steps after it read whatever it wrote.
 */
export async function runWorkflow(
  options: RunWorkflowOptions,
): Promise<Map<string, WorkflowStepState>> {
  const { graph } = options;
  // Aborted by the caller (the user stopped) or by a step that failed.
  const controller = new AbortController();
  const signal = controller.signal;
  const abortFromCaller = () => controller.abort(options.signal.reason);
  if (options.signal.aborted) abortFromCaller();
  else options.signal.addEventListener("abort", abortFromCaller, { once: true });
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? abortableSleep;
  const incoming = getIncomingMap(graph);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const states = new Map<string, WorkflowStepState>();
  const running = new Map<string, Promise<WorkflowStepState | null>>();

  const publish = (state: WorkflowStepState) => {
    states.set(state.nodeId, state);
    options.onStep(state);
  };

  for (const node of graph.nodes) {
    if (!isStepNode(node)) continue;
    const reused = options.reused?.get(node.id);
    publish(
      reused ? { ...reused, reused: true } : { nodeId: node.id, status: "pending", output: "" },
    );
  }

  const finished = (state: WorkflowStepState | null | undefined) =>
    state?.status === "done" ||
    state?.status === "skipped" ||
    (state?.status === "error" && state.continued === true);

  const getStepOutputs = (nodeId: string) => {
    const outputs = new Map<string, string>();
    for (const ancestorId of getAncestorIds(graph, nodeId)) {
      const ancestor = nodesById.get(ancestorId);
      const state = states.get(ancestorId);
      if (ancestor && isStepNode(ancestor) && finished(state)) {
        outputs.set(ancestor.key, state!.output);
      }
    }
    return outputs;
  };

  const run = (node: WorkflowNode): Promise<WorkflowStepState | null> => {
    const existing = running.get(node.id);
    if (existing) return existing;
    const promise = (async (): Promise<WorkflowStepState | null> => {
      if (node.type === "input") return { nodeId: node.id, status: "done", output: options.input };
      if (options.skip?.has(node.id)) return states.get(node.id) ?? null;
      const parents = await Promise.all(
        (incoming.get(node.id) ?? []).map((id) => run(nodesById.get(id)!)),
      );
      if (node.type === "output") return parents[0] ?? null;

      const reused = states.get(node.id);
      if (reused?.reused) return reused;
      if (signal.aborted || !parents.every(finished)) return states.get(node.id) ?? null;

      const inputs = parents.map((parent) => parent!.output);
      if (node.type === "merge") return runMerge(node, inputs);
      return runAiStep(node, inputs[0] ?? "", nodesById.get(incoming.get(node.id)?.[0] ?? ""));
    })();
    running.set(node.id, promise);
    return promise;
  };

  const runMerge = (node: WorkflowMergeNode, inputs: string[]): WorkflowStepState => {
    const joined = inputs.filter((input) => input.trim()).join("\n\n");
    const output =
      node.disabled || !node.template.trim()
        ? node.disabled
          ? (inputs[0] ?? "")
          : joined
        : renderTemplate(node.template, { input: joined, steps: getStepOutputs(node.id) });
    const at = now();
    const state: WorkflowStepState = {
      nodeId: node.id,
      status: node.disabled ? "skipped" : "done",
      output,
      startedAt: at,
      endedAt: at,
    };
    publish(state);
    return state;
  };

  const runAiStep = async (
    node: WorkflowAiNode,
    input: string,
    parent: WorkflowNode | undefined,
  ): Promise<WorkflowStepState> => {
    const startedAt = now();
    const fail = (failed: WorkflowStepState): WorkflowStepState => {
      const continues = getFailureMode(node) === "continue";
      const next = continues ? { ...failed, continued: true } : failed;
      publish(next);
      if (!continues) controller.abort(new Error(`Step "${node.name}" failed.`));
      return next;
    };
    if (node.disabled) {
      const state: WorkflowStepState = {
        nodeId: node.id,
        status: "skipped",
        output: input,
        startedAt,
        endedAt: startedAt,
      };
      publish(state);
      return state;
    }

    const request = buildStepRequest(node, input, parent, options.context, getStepOutputs(node.id));
    if (!request) {
      return fail({
        nodeId: node.id,
        status: "error",
        output: "",
        error: "This step has nothing to work on: give it an input, a prompt, or chat context.",
        startedAt,
        endedAt: startedAt,
      });
    }

    const modelId = node.model?.modelId;
    let state: WorkflowStepState = {
      nodeId: node.id,
      status: "running",
      output: "",
      startedAt,
      ...(modelId ? { modelId } : {}),
    };
    publish(state);

    if (!node.model) {
      return fail({ ...state, status: "error", error: "No model is available.", endedAt: now() });
    }

    let generated = "";
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await options.callModel({
          step: { id: node.id, name: node.name },
          model: node.model,
          system: request.system,
          messages: request.messages,
          signal,
          onText: (delta) => {
            generated += delta;
            state = { ...state, output: request.prefix + generated };
            publish(state);
          },
        });
        state = {
          ...state,
          status: "done",
          output: request.prefix + generated,
          modelId: result.modelId,
          endedAt: now(),
          ...(result.tokens ? { tokens: result.tokens } : {}),
          ...(result.cost ? { cost: result.cost } : {}),
        };
        delete state.retry;
        // Some providers end a call cleanly with no text (e.g. only reasoning);
        // the steps after it would work on nothing.
        if (!generated.trim()) {
          return fail({ ...state, status: "error", error: "The model replied with no text." });
        }
        publish(state);
        return state;
      } catch (error) {
        if (signal.aborted) {
          state = {
            ...state,
            status: "stopped",
            partial: generated.length > 0,
            endedAt: now(),
          };
          delete state.retry;
          publish(state);
          return state;
        }

        // Only a call that has not written anything can be retried cleanly.
        const delay = generated.length === 0 ? options.getRetryDelay?.(error, attempt) : null;
        if (delay !== null && delay !== undefined) {
          state = { ...state, status: "waiting", retry: { attempt, retryAt: now() + delay } };
          publish(state);
          try {
            await sleep(delay, signal);
          } catch {
            // Stopped while waiting; the next iteration reports it.
          }
          if (signal.aborted) {
            state = { ...state, status: "stopped", partial: false, endedAt: now() };
            delete state.retry;
            publish(state);
            return state;
          }
          state = { ...state, status: "running" };
          delete state.retry;
          publish(state);
          continue;
        }

        state = {
          ...state,
          status: "error",
          error: options.formatError
            ? options.formatError(error)
            : error instanceof Error
              ? error.message
              : String(error),
          partial: generated.length > 0,
          endedAt: now(),
        };
        delete state.retry;
        return fail(state);
      }
    }
  };

  try {
    await Promise.all(graph.nodes.map(run));
  } finally {
    options.signal.removeEventListener("abort", abortFromCaller);
  }
  return states;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
