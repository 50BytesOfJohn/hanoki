import type { ModelMessage } from "ai";

import {
  getAncestorIds,
  getDisabledDecisionBranch,
  getFailureMode,
  getLoopBody,
  getModelForPass,
  getLoopEdge,
  getOtherBranch,
  getStepRetries,
  getTextSource,
  isStepNode,
  renderTemplate,
  topologicalOrder,
  type WorkflowAiNode,
  type WorkflowDecisionNode,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowMergeNode,
  type WorkflowModelNode,
  type WorkflowModelRef,
  type WorkflowNode,
} from "@shared/workflow/graph";
import type { WorkflowDecisionState, WorkflowStepState } from "@shared/workflow/run";
import {
  buildDecisionRequest,
  buildStepRequest,
  type StepContext,
  type StepRequest,
} from "@shared/workflow/step-request";

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

export type WorkflowDecisionCall = Omit<WorkflowModelCall, "onText">;

export interface WorkflowDecisionResult extends WorkflowModelResult {
  answer: boolean;
  reason?: string;
  method?: WorkflowDecisionState["method"];
}

export interface RunWorkflowOptions {
  /** Every model step's `model` is already resolved to what it should run with; AI steps take their `passModels` on later passes. */
  graph: WorkflowGraph;
  /** The request's text, as the Input step's output. */
  input: string;
  /** What "Include context" adds: the chat history and the chat's instructions. */
  context: StepContext;
  /** Steps carried over from an earlier run; they are not run again unless a loop does. */
  reused?: ReadonlyMap<string, WorkflowStepState>;
  /** Steps a rerun leaves out because nothing reads their output; they stay pending. */
  skip?: ReadonlySet<string>;
  signal: AbortSignal;
  callModel: (call: WorkflowModelCall) => Promise<WorkflowModelResult>;
  /** Asks a Decision's question; resolves with the model's yes or no. */
  decide?: (call: WorkflowDecisionCall) => Promise<WorkflowDecisionResult>;
  /** Decides whether a failed call is a provider limit worth waiting out, and for how long. */
  getRetryDelay?: (error: unknown, attempt: number) => number | null;
  formatError?: (error: unknown) => string;
  /**
   * Called with every change to a step; `output` grows while a step streams.
   * A step a loop runs again starts over with the next `iteration`; the last
   * state of each earlier iteration is final.
   */
  onStep: (state: WorkflowStepState) => void;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

type EdgeState = "active" | "dead" | "open";

/**
 * Runs every step as soon as the steps it reads from have settled, so
 * branches fanning out of one step run at the same time. A step whose input
 * failed or was stopped does not run and stays `pending`.
 *
 * A Decision hands on its input along the branch it answers; steps that only
 * the other branch reaches become `inactive`, and a Merge runs with the inputs
 * that are still live. A branch that loops back starts every step from the
 * loop's target onwards over (a step still writing is stopped), until the
 * Decision has looped `maxLoops` times; then it stops the run or takes the
 * other branch.
 *
 * A model step fails when its call errors or, for an AI step, its reply has no
 * text. It first tries again as often as its `retries` allow. Unless the step
 * is set to continue, a failure ends the run: steps still writing are stopped
 * and nothing else starts. A step set to continue is `error` with
 * `continued`, and the steps after it read whatever it wrote.
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
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const order = (topologicalOrder(graph) ?? graph.nodes).filter(isStepNode);
  const incomingEdges = new Map<string, WorkflowEdge[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) if (!edge.loop) incomingEdges.get(edge.target)?.push(edge);

  const states = new Map<string, WorkflowStepState>();
  /** Bumped whenever a loop starts a step over; results of an older start are dropped. */
  const generations = new Map<string, number>();
  const stepControllers = new Map<string, AbortController>();
  const started = new Set<string>();
  const loopCounts = new Map<string, number>();
  let inflight = 0;
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const publish = (state: WorkflowStepState) => {
    states.set(state.nodeId, state);
    options.onStep(state);
  };

  for (const node of order) {
    const reused = options.reused?.get(node.id);
    publish(
      reused ? { ...reused, reused: true } : { nodeId: node.id, status: "pending", output: "" },
    );
  }

  const finished = (state: WorkflowStepState | null | undefined) =>
    state?.status === "done" ||
    state?.status === "skipped" ||
    (state?.status === "error" && state.continued === true);

  const getOutput = (node: WorkflowNode): string =>
    node.type === "input" ? options.input : (states.get(node.id)?.output ?? "");

  const getEdgeState = (edge: WorkflowEdge): EdgeState => {
    const source = nodesById.get(edge.source);
    if (!source) return "dead";
    if (source.type === "input") return "active";
    const state = states.get(source.id);
    if (state?.status === "inactive") return "dead";
    if (!finished(state)) return "open";
    if (source.type !== "decision") return "active";
    const branch = state?.decision?.branch ?? getDisabledDecisionBranch(graph, source.id);
    return edge.sourceHandle === branch ? "active" : "dead";
  };

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

  /** Starts every step whose inputs have settled; marks steps no live branch reaches. */
  const pump = () => {
    if (signal.aborted) return;
    for (const node of order) {
      if (started.has(node.id) || options.skip?.has(node.id)) continue;
      const state = states.get(node.id);
      if (state?.status !== "pending") continue;
      const edges = incomingEdges.get(node.id) ?? [];
      const edgeStates = edges.map(getEdgeState);
      if (edgeStates.includes("open")) continue;
      if (edges.length > 0 && edgeStates.every((edgeState) => edgeState === "dead")) {
        const at = now();
        publish({ ...state, status: "inactive", output: "", startedAt: at, endedAt: at });
        continue;
      }
      const inputs = edges.filter((_, index) => edgeStates[index] === "active");
      start(node, inputs);
    }
  };

  const start = (node: WorkflowNode, inputs: WorkflowEdge[]) => {
    started.add(node.id);
    const generation = generations.get(node.id) ?? 0;
    const iteration = states.get(node.id)?.iteration;
    const isCurrent = () => (generations.get(node.id) ?? 0) === generation;
    const report = (state: WorkflowStepState) => {
      if (isCurrent()) publish(iteration ? { ...state, iteration } : state);
    };
    const texts = inputs.map((edge) => getOutput(nodesById.get(edge.source)!));
    const stepController = new AbortController();
    const abortStep = () => stepController.abort(signal.reason);
    if (signal.aborted) abortStep();
    else signal.addEventListener("abort", abortStep, { once: true });
    stepControllers.set(node.id, stepController);

    const step = { report, isCurrent, signal: stepController.signal, iteration: iteration ?? 1 };
    inflight += 1;
    const work: Promise<void> =
      node.type === "merge"
        ? Promise.resolve(runMerge(node, texts, step))
        : node.type === "ai"
          ? runAiStep(node, texts[0] ?? "", step).then(() => {})
          : node.type === "decision"
            ? runDecision(node, texts[0] ?? "", step)
            : Promise.resolve();
    void work
      .catch((error: unknown) => {
        console.error("[workflow] Step crashed.", { nodeId: node.id }, error);
        const state = states.get(node.id);
        if (!isCurrent() || !state) return;
        publish({ ...state, status: "error", error: "Something went wrong.", endedAt: now() });
        controller.abort(error);
      })
      .finally(() => {
        signal.removeEventListener("abort", abortStep);
        if (stepControllers.get(node.id) === stepController) stepControllers.delete(node.id);
        inflight -= 1;
        pump();
        if (inflight === 0) settle();
      });
  };

  interface StepRun {
    report: (state: WorkflowStepState) => void;
    isCurrent: () => boolean;
    signal: AbortSignal;
    /** Which pass of the step this is, from 1. */
    iteration: number;
  }

  const runMerge = (node: WorkflowMergeNode, inputs: string[], step: StepRun) => {
    const joined = inputs.filter((input) => input.trim()).join("\n\n");
    const output =
      node.disabled || !node.template.trim()
        ? node.disabled
          ? (inputs[0] ?? "")
          : joined
        : renderTemplate(node.template, { input: joined, steps: getStepOutputs(node.id) });
    const at = now();
    step.report({
      nodeId: node.id,
      status: node.disabled ? "skipped" : "done",
      output,
      startedAt: at,
      endedAt: at,
    });
  };

  /** Ends the run unless `node` is set to continue past its failure. */
  const fail = (node: WorkflowModelNode, failed: WorkflowStepState, step: StepRun) => {
    const continues = node.type === "ai" && getFailureMode(node) === "continue";
    step.report(continues ? { ...failed, continued: true } : failed);
    if (!continues && step.isCurrent()) controller.abort(new Error(`Step "${node.name}" failed.`));
  };

  /**
   * One model call with its retries: provider limits are waited out, other
   * errors and replies `check` rejects are tried again up to the step's
   * `retries`. Resolves with the final state, already reported, or null when
   * the step was stopped.
   */
  const callWithRetries = async <Result extends WorkflowModelResult>({
    node,
    model,
    step,
    invoke,
    check,
    finish,
  }: {
    node: WorkflowModelNode;
    /** The model this pass runs with; null when none is available. */
    model: WorkflowModelRef | null;
    step: StepRun;
    invoke: (
      model: WorkflowModelRef,
      signal: AbortSignal,
      onText: (delta: string) => void,
    ) => Promise<Result>;
    /** Why a successful call still failed (e.g. no text), or null. */
    check: (result: Result, text: string) => string | null;
    finish: (state: WorkflowStepState, result: Result, text: string) => WorkflowStepState;
  }): Promise<WorkflowStepState | null> => {
    const startedAt = now();
    const modelId = model?.modelId;
    let state: WorkflowStepState = {
      nodeId: node.id,
      status: "running",
      output: "",
      startedAt,
      ...(modelId ? { modelId } : {}),
    };
    step.report(state);
    if (!model) {
      fail(
        node,
        { ...state, status: "error", error: "No model is available.", endedAt: now() },
        step,
      );
      return null;
    }

    const maxAttempts = getStepRetries(node) + 1;
    const retriedErrors: string[] = [];
    let attempt = 1;
    let limitAttempt = 1;
    const stopped = (partial: boolean): null => {
      state = { ...state, status: "stopped", partial, endedAt: now() };
      delete state.retry;
      step.report(state);
      return null;
    };
    // An error or empty reply with tries left starts the step over.
    const retryOrFail = (error: string, partial: boolean): boolean => {
      if (attempt < maxAttempts) {
        retriedErrors.push(error);
        attempt += 1;
        state = {
          ...state,
          status: "running",
          output: "",
          attempt,
          retriedErrors: [...retriedErrors],
        };
        delete state.error;
        delete state.partial;
        step.report(state);
        return true;
      }
      fail(node, { ...state, status: "error", error, partial, endedAt: now() }, step);
      return false;
    };

    for (;;) {
      let text = "";
      try {
        const result = await invoke(model, step.signal, (delta) => {
          text += delta;
          state = { ...state, output: text };
          step.report(state);
        });
        if (step.signal.aborted) return stopped(text.length > 0);
        state = {
          ...state,
          modelId: result.modelId,
          ...(result.tokens ? { tokens: addTokens(state.tokens, result.tokens) } : {}),
          ...(result.cost ? { cost: addCost(state.cost, result.cost) } : {}),
        };
        const problem = check(result, text);
        if (problem) {
          if (retryOrFail(problem, false)) continue;
          return null;
        }
        state = finish({ ...state, status: "done", endedAt: now() }, result, text);
        delete state.retry;
        step.report(state);
        return state;
      } catch (error) {
        if (step.signal.aborted) return stopped(text.length > 0);

        // Only a call that has not written anything can be waited out cleanly.
        const delay = text.length === 0 ? options.getRetryDelay?.(error, limitAttempt) : null;
        if (delay !== null && delay !== undefined) {
          state = {
            ...state,
            status: "waiting",
            retry: { attempt: limitAttempt, retryAt: now() + delay },
          };
          step.report(state);
          limitAttempt += 1;
          try {
            await sleep(delay, step.signal);
          } catch {
            // Stopped while waiting; reported below.
          }
          if (step.signal.aborted) return stopped(false);
          state = { ...state, status: "running" };
          delete state.retry;
          step.report(state);
          continue;
        }

        delete state.retry;
        const message = options.formatError
          ? options.formatError(error)
          : error instanceof Error
            ? error.message
            : String(error);
        state = { ...state, output: text };
        if (retryOrFail(message, text.length > 0)) continue;
        return null;
      }
    }
  };

  const runAiStep = async (
    node: WorkflowAiNode,
    input: string,
    step: StepRun,
  ): Promise<WorkflowStepState | null> => {
    const startedAt = now();
    if (node.disabled) {
      const state: WorkflowStepState = {
        nodeId: node.id,
        status: "skipped",
        output: input,
        startedAt,
        endedAt: startedAt,
      };
      step.report(state);
      return state;
    }

    const request = buildStepRequest(
      node,
      input,
      getTextSource(graph, node.id),
      options.context,
      getStepOutputs(node.id),
    );
    if (!request) {
      fail(
        node,
        {
          nodeId: node.id,
          status: "error",
          output: "",
          error: "This step has nothing to work on: give it an input, a prompt, or chat context.",
          startedAt,
          endedAt: startedAt,
        },
        step,
      );
      return null;
    }

    return callWithRetries({
      node,
      // Each pass a loop runs takes the next of the step's models.
      model: getModelForPass(node, step.iteration),
      step: { ...step, report: (state) => step.report(withPrefix(state, request)) },
      invoke: (model, signal, onText) =>
        options.callModel({
          step: { id: node.id, name: node.name },
          model,
          system: request.system,
          messages: request.messages,
          signal,
          onText,
        }),
      // Some providers end a call cleanly with no text (e.g. only reasoning);
      // the steps after it would work on nothing.
      check: (_result, text) => (text.trim() ? null : "The model replied with no text."),
      finish: (state) => state,
    });
  };

  const runDecision = async (
    node: WorkflowDecisionNode,
    input: string,
    step: StepRun,
  ): Promise<void> => {
    const startedAt = now();
    if (node.disabled) {
      const branch = getDisabledDecisionBranch(graph, node.id);
      step.report({
        nodeId: node.id,
        status: "skipped",
        output: input,
        startedAt,
        endedAt: startedAt,
        decision: { answer: branch === "true", branch },
      });
      return;
    }

    const request = buildDecisionRequest(
      node,
      input,
      getTextSource(graph, node.id),
      options.context,
      getStepOutputs(node.id),
    );
    if (!request || !options.decide) {
      fail(
        node,
        {
          nodeId: node.id,
          status: "error",
          output: input,
          error: request
            ? "Decisions can't run here."
            : "This Decision has no question. Ask one in its settings.",
          startedAt,
          endedAt: startedAt,
        },
        step,
      );
      return;
    }

    const decide = options.decide;
    const decided = await callWithRetries({
      node,
      model: node.model,
      step: {
        ...step,
        // A Decision hands on the text it judges, whatever it answers.
        report: (state) => step.report({ ...state, output: input }),
      },
      invoke: (model, signal) =>
        decide({
          step: { id: node.id, name: node.name },
          model,
          system: request.system,
          messages: request.messages,
          signal,
        }),
      check: () => null,
      finish: (state, result) => ({
        ...state,
        output: input,
        decision: {
          answer: result.answer,
          branch: result.answer ? "true" : "false",
          ...(result.reason ? { reason: result.reason } : {}),
          ...(result.method ? { method: result.method } : {}),
        },
      }),
    });
    if (!decided?.decision || !step.isCurrent()) return;

    const loopEdge = getLoopEdge(graph, node.id);
    const { branch } = decided.decision;
    if (!loopEdge || loopEdge.sourceHandle !== branch) return;

    const count = loopCounts.get(node.id) ?? 0;
    if (count < node.maxLoops) {
      loopCounts.set(node.id, count + 1);
      step.report({
        ...decided,
        decision: { ...decided.decision, loop: { count: count + 1, max: node.maxLoops } },
      });
      restartLoop(loopEdge, node.id);
      return;
    }

    const limited: WorkflowDecisionState = {
      ...decided.decision,
      limitReached: true,
      loop: { count, max: node.maxLoops },
    };
    if (node.onLoopLimit === "continue") {
      step.report({ ...decided, decision: { ...limited, branch: getOtherBranch(branch) } });
      return;
    }
    fail(
      node,
      {
        ...decided,
        status: "error",
        decision: limited,
        error: `Still “${branch === "true" ? "Yes" : "No"}” after looping ${count} ${
          count === 1 ? "time" : "times"
        }, the most allowed.`,
      },
      step,
    );
  };

  /**
   * Starts the loop's steps over: each one that ran gets a new iteration and
   * one still writing is stopped first. The Decision that loops keeps its
   * count; Decisions inside the loop start counting again.
   */
  const restartLoop = (edge: WorkflowEdge, decisionId: string) => {
    for (const id of getLoopBody(graph, edge)) {
      const node = nodesById.get(id);
      const state = states.get(id);
      if (!node || !isStepNode(node) || !state) continue;
      if (id !== decisionId) loopCounts.delete(id);
      if (state.status === "running" || state.status === "waiting") {
        const stopped: WorkflowStepState = {
          ...state,
          status: "stopped",
          partial: state.output.length > 0,
          endedAt: now(),
        };
        delete stopped.retry;
        publish(stopped);
      }
      generations.set(id, (generations.get(id) ?? 0) + 1);
      stepControllers.get(id)?.abort(new Error("Started over by a loop."));
      started.delete(id);
      if (state.status === "pending") continue;
      publish({ nodeId: id, status: "pending", output: "", iteration: (state.iteration ?? 1) + 1 });
    }
  };

  try {
    pump();
    if (inflight > 0) await settled;
  } finally {
    options.signal.removeEventListener("abort", abortFromCaller);
  }
  return states;
}

/** A continued step's output leads with the text it continues. */
function withPrefix(state: WorkflowStepState, request: StepRequest): WorkflowStepState {
  return request.prefix ? { ...state, output: request.prefix + state.output } : state;
}

function addTokens(
  total: WorkflowStepState["tokens"],
  next: NonNullable<WorkflowStepState["tokens"]>,
): NonNullable<WorkflowStepState["tokens"]> {
  if (!total) return next;
  return {
    ...(total.input !== undefined || next.input !== undefined
      ? { input: (total.input ?? 0) + (next.input ?? 0) }
      : {}),
    ...(total.output !== undefined || next.output !== undefined
      ? { output: (total.output ?? 0) + (next.output ?? 0) }
      : {}),
  };
}

function addCost(
  total: WorkflowStepState["cost"],
  next: NonNullable<WorkflowStepState["cost"]>,
): NonNullable<WorkflowStepState["cost"]> {
  if (!total || total.currency !== next.currency) return next;
  return {
    currency: next.currency,
    ...(total.total !== undefined || next.total !== undefined
      ? { total: (total.total ?? 0) + (next.total ?? 0) }
      : {}),
  };
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
