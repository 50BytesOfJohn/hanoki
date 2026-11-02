import { type } from "arktype";

import type { HanokiUiMessage } from "../chat/message-metadata";
import {
  getDescendantIds,
  getIncomingMap,
  getMainPath,
  isStepNode,
  type WorkflowGraph,
} from "./graph";

/**
 * - `waiting`: a provider limit was hit; the step retries at `retry.retryAt`.
 * - `stopped`: the user stopped the run while the step was writing.
 * - `skipped`: the step is disabled and passed its input through.
 */
export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "waiting"
  | "done"
  | "error"
  | "stopped"
  | "skipped";

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

export function getStepPartId(runId: string, nodeId: string): string {
  return `${runId}:${nodeId}`;
}

export function getWorkflowRun(message: Pick<HanokiUiMessage, "parts">): WorkflowRunState | null {
  for (const part of message.parts) {
    if (part.type === "data-workflowRun") return part.data;
  }
  return null;
}

export function getWorkflowSteps(
  message: Pick<HanokiUiMessage, "parts">,
): Map<string, WorkflowStepState> {
  const steps = new Map<string, WorkflowStepState>();
  for (const part of message.parts) {
    if (part.type === "data-workflowStep") steps.set(part.data.nodeId, part.data);
  }
  return steps;
}

export function isWorkflowRunActive(status: WorkflowStepStatus): boolean {
  return status === "running" || status === "waiting";
}

/**
 * Which step becomes the message. A finished run uses what reached Output.
 * Otherwise the last finished AI step on the main path wins, so stopping after
 * a good first pass keeps that text with no extra cost.
 */
export function selectWorkflowOutput(
  graph: WorkflowGraph,
  steps: ReadonlyMap<string, WorkflowStepState>,
): { nodeId: string; text: string } | null {
  const [output, ...path] = getMainPath(graph);
  if (output?.type !== "output") return null;

  const outputSource = path[0];
  const sourceState = outputSource ? steps.get(outputSource.id) : undefined;
  if (outputSource && (sourceState?.status === "done" || sourceState?.status === "skipped")) {
    return { nodeId: outputSource.id, text: sourceState.output };
  }

  for (const node of path) {
    if (node.type !== "ai") continue;
    const state = steps.get(node.id);
    if (state?.status === "done" && state.output.trim()) {
      return { nodeId: node.id, text: state.output };
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
