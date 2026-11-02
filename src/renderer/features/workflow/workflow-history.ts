import type { WorkflowGraph } from "@shared/workflow/graph";

export const WORKFLOW_HISTORY_LIMIT = 100;
/** Edits of one kind closer together than this are one undo step, e.g. typing a word. */
export const WORKFLOW_EDIT_BURST_MS = 500;

/**
 * Undo history of one workflow, as whole graph snapshots: graphs are small and
 * immutable, so a snapshot is cheap and undo can never drift from what was shown.
 */
export interface WorkflowHistory {
  past: readonly WorkflowGraph[];
  future: readonly WorkflowGraph[];
  /** The last edit while the next one of the same kind may still join it. */
  burst: { key: string; at: number } | null;
}

export const EMPTY_WORKFLOW_HISTORY: WorkflowHistory = { past: [], future: [], burst: null };

export interface RecordWorkflowEditOptions {
  /** Edits sharing a key join one undo step until a pause or `endWorkflowEditBurst`. */
  coalesceKey?: string;
  now: number;
  limit?: number;
}

/** Records that the graph is about to change from `before`. */
export function recordWorkflowEdit(
  history: WorkflowHistory,
  before: WorkflowGraph,
  { coalesceKey, now, limit = WORKFLOW_HISTORY_LIMIT }: RecordWorkflowEditOptions,
): WorkflowHistory {
  const burst = coalesceKey ? { key: coalesceKey, at: now } : null;
  if (
    coalesceKey &&
    history.burst?.key === coalesceKey &&
    now - history.burst.at < WORKFLOW_EDIT_BURST_MS
  ) {
    // The snapshot from the burst's first edit stays the undo point.
    return { past: history.past, future: [], burst };
  }
  return { past: [...history.past, before].slice(-limit), future: [], burst };
}

export function undoWorkflowEdit(
  history: WorkflowHistory,
  current: WorkflowGraph,
): { history: WorkflowHistory; graph: WorkflowGraph } | null {
  const graph = history.past.at(-1);
  if (!graph) return null;
  return {
    graph,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future], burst: null },
  };
}

export function redoWorkflowEdit(
  history: WorkflowHistory,
  current: WorkflowGraph,
  limit = WORKFLOW_HISTORY_LIMIT,
): { history: WorkflowHistory; graph: WorkflowGraph } | null {
  const [graph, ...future] = history.future;
  if (!graph) return null;
  return {
    graph,
    history: { past: [...history.past, current].slice(-limit), future, burst: null },
  };
}

/** The next edit starts a new undo step, e.g. once a text field loses focus. */
export function endWorkflowEditBurst(history: WorkflowHistory): WorkflowHistory {
  return history.burst ? { ...history, burst: null } : history;
}
