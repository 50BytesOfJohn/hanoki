import { type } from "arktype";

import type { HanokiUiMessage } from "../chat/message-metadata";
import {
  getDescendantIds,
  getIncomingMap,
  getMainPath,
  isStepNode,
  type WorkflowBranch,
  type WorkflowGraph,
} from "./graph";

/**
 * - `waiting`: a provider limit was hit; the step retries at `retry.retryAt`.
 * - `stopped`: the user stopped the run while the step was writing, or a loop
 *   started the step over.
 * - `skipped`: the step is disabled and passed its input through.
 * - `inactive`: a Decision before it took the other branch.
 */
export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "waiting"
  | "done"
  | "error"
  | "stopped"
  | "skipped"
  | "inactive";

export interface WorkflowDecisionState {
  /** What the model answered. */
  answer: boolean;
  /** The model's short reason, when it gave one. */
  reason?: string;
  /** The branch the run went on along; differs from `answer` when the loop limit was reached. */
  branch: WorkflowBranch;
  /** Set when the branch taken loops back: how many times it has, of how many allowed. */
  loop?: { count: number; max: number };
  /** The answer would have looped once more than allowed. */
  limitReached?: boolean;
  /** How the answer was read: a JSON schema, or a plain yes/no reply. */
  method?: "structured" | "text";
}

export type WorkflowRunStatus = "running" | "done" | "stopped" | "error";

export interface WorkflowStepState {
  nodeId: string;
  status: WorkflowStepStatus;
  output: string;
  /** The text was cut short by a stop or an error. */
  partial?: boolean;
  /** Failed, but the step is set to continue: later steps read `output` as it is. */
  continued?: boolean;
  /** Copied from an earlier run by "rerun from step". */
  reused?: boolean;
  /** The model that ran the step; absent for Merge and skipped steps. */
  modelId?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  retry?: { attempt: number; retryAt: number };
  /**
   * Which time this step runs in the run, from 1; a loop runs its steps again.
   * Earlier times are kept as their own parts. Absent is 1.
   */
  iteration?: number;
  /** Which try this is after errors or empty replies, from 1, when the step retries. Absent is 1. */
  attempt?: number;
  /** Errors of earlier tries that were retried. */
  retriedErrors?: string[];
  decision?: WorkflowDecisionState;
  tokens?: { input?: number; output?: number };
  cost?: { total?: number; currency: string };
}

export interface WorkflowRunState {
  runId: string;
  workflowId: string | null;
  name: string;
  status: WorkflowRunStatus;
  /** The setup this run used, with every AI step's model resolved. */
  graph: WorkflowGraph;
  /** Whose output is the message; null while running or when nothing finished. */
  outputNodeId: string | null;
  /** Set when the message is an earlier pass of that step, which a loop ran again. */
  outputIteration?: number;
  rerunFrom?: { sourceMessageId: string; nodeId: string };
  startedAt: number;
  endedAt?: number;
}

/** `body.workflow` of a chat request. */
export const workflowRequestSchema = type({
  "workflowId?": "0 < string <= 64",
  "rerun?": { sourceMessageId: "0 < string <= 64", nodeId: "0 < string <= 64" },
});

export type WorkflowRequest = typeof workflowRequestSchema.infer;

/** One part per step and time it ran, so a loop's earlier passes stay on the message. */
export function getStepPartId(runId: string, nodeId: string, iteration = 1): string {
  return iteration > 1 ? `${runId}:${nodeId}:${iteration}` : `${runId}:${nodeId}`;
}

export function getWorkflowRun(message: Pick<HanokiUiMessage, "parts">): WorkflowRunState | null {
  for (const part of message.parts) {
    if (part.type === "data-workflowRun") return part.data;
  }
  return null;
}

/** Each step's latest pass. */
export function getWorkflowSteps(
  message: Pick<HanokiUiMessage, "parts">,
): Map<string, WorkflowStepState> {
  const steps = new Map<string, WorkflowStepState>();
  for (const part of message.parts) {
    if (part.type !== "data-workflowStep") continue;
    const current = steps.get(part.data.nodeId);
    if (!current || (part.data.iteration ?? 1) >= (current.iteration ?? 1)) {
      steps.set(part.data.nodeId, part.data);
    }
  }
  return steps;
}

/** Every pass of every step, in the order they are stored. */
export function getAllWorkflowStepPasses(
  message: Pick<HanokiUiMessage, "parts">,
): WorkflowStepState[] {
  return message.parts.flatMap((part) => (part.type === "data-workflowStep" ? [part.data] : []));
}

/** Each step's earlier passes, oldest first; steps that ran once have none. */
export function getWorkflowStepHistory(
  message: Pick<HanokiUiMessage, "parts">,
): Map<string, WorkflowStepState[]> {
  const latest = getWorkflowSteps(message);
  const history = new Map<string, WorkflowStepState[]>();
  for (const part of message.parts) {
    if (part.type !== "data-workflowStep") continue;
    if (latest.get(part.data.nodeId) === part.data) continue;
    const list = history.get(part.data.nodeId) ?? [];
    list.push(part.data);
    history.set(part.data.nodeId, list);
  }
  for (const list of history.values()) {
    list.sort((a, b) => (a.iteration ?? 1) - (b.iteration ?? 1));
  }
  return history;
}

export function isWorkflowRunActive(status: WorkflowStepStatus): boolean {
  return status === "running" || status === "waiting";
}

/**
 * Which step becomes the message. A finished run uses what reached Output;
 * a Decision there hands on its input, so the message is the step that wrote
 * it. Otherwise the last finished AI step on the main path wins, so stopping
 * after a good first pass keeps that text with no extra cost.
 */
export function selectWorkflowOutput(
  graph: WorkflowGraph,
  steps: ReadonlyMap<string, WorkflowStepState>,
): { nodeId: string; text: string; reachedOutput: boolean } | null {
  const [output, ...path] = getMainPath(graph);
  if (output?.type !== "output") return null;

  const isDone = (nodeId: string) => {
    const status = steps.get(nodeId)?.status;
    return status === "done" || status === "skipped";
  };
  const outputSource = path[0];
  if (outputSource && isDone(outputSource.id)) {
    let writer = outputSource;
    for (const node of path.slice(1)) {
      if (writer.type !== "decision" || !isStepNode(node) || !isDone(node.id)) break;
      writer = node;
    }
    return { nodeId: writer.id, text: steps.get(outputSource.id)!.output, reachedOutput: true };
  }

  for (const node of path) {
    if (node.type !== "ai") continue;
    const state = steps.get(node.id);
    if (state?.status === "done" && state.output.trim()) {
      return { nodeId: node.id, text: state.output, reachedOutput: false };
    }
  }
  return null;
}

export interface WorkflowRerunPlan {
  /** The chosen step and everything downstream of it: these run again. */
  rerun: Set<string>;
  /** Steps that finished in the source run and don't depend on the chosen one. */
  reused: Set<string>;
  /**
   * Steps whose output nothing would read: they feed only kept steps (or
   * nothing), e.g. a step added since the run. They don't run.
   */
  skipped: Set<string>;
}

/** Which steps a "rerun from step" runs, keeps and leaves out. */
export function planWorkflowRerun(
  graph: WorkflowGraph,
  nodeId: string,
  sourceSteps: ReadonlyMap<string, WorkflowStepState>,
): WorkflowRerunPlan {
  const rerun = new Set([nodeId, ...getDescendantIds(graph, nodeId)]);
  const reused = new Set<string>();
  for (const node of graph.nodes) {
    const status = sourceSteps.get(node.id)?.status;
    if (!rerun.has(node.id) && (status === "done" || status === "skipped")) reused.add(node.id);
  }
  // Walk back from what runs again and from Output; a kept step doesn't read
  // its inputs again, so the walk stops there.
  const incoming = getIncomingMap(graph);
  const needed = new Set(rerun);
  const stack = [
    ...rerun,
    ...graph.nodes.filter((node) => node.type === "output").map((n) => n.id),
  ];
  while (stack.length > 0) {
    for (const source of incoming.get(stack.pop()!) ?? []) {
      if (reused.has(source) || needed.has(source)) continue;
      needed.add(source);
      stack.push(source);
    }
  }
  const skipped = new Set(
    graph.nodes
      .filter((node) => isStepNode(node) && !needed.has(node.id) && !reused.has(node.id))
      .map((node) => node.id),
  );
  return { rerun, reused, skipped };
}
