import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { workflowsApi } from "@/api/workflows";
import { toastManager } from "@/components/ui/toast";
import { queryClient } from "@/lib/query-client";
import { getItemQueryOptions } from "@/queries/items";
import { queryKeys } from "@/queries/keys";
import type { ItemInfo, WorkflowInfo } from "@shared/ipc";
import { getWorkflowGraphProblem, type WorkflowGraph } from "@shared/workflow/graph";

import {
  EMPTY_WORKFLOW_HISTORY,
  endWorkflowEditBurst as endHistoryBurst,
  recordWorkflowEdit,
  redoWorkflowEdit,
  undoWorkflowEdit,
  type WorkflowHistory,
} from "./workflow-history";

const SAVE_DELAY_MS = 400;

interface PendingSave {
  graph: WorkflowGraph;
  /** The local edit this save writes; see `LocalGraph.version`. */
  version: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The graph the editor shows, until the stored row has caught up with it.
 * Other code refetches every item (e.g. whenever any title changes); while a
 * save is pending, or the graph can't be saved yet, that refetch would put the
 * stored graph back over the edits. `savedAt` is the stored row's `updatedAt`
 * once this graph was written.
 *
 * `graph` is the object the cache holds: `setQueryData` shares structure with
 * the previous data, so it stores a copy of what it was given. Saves are
 * matched to edits by `version`, since re-applying makes another copy.
 */
interface LocalGraph {
  graph: WorkflowGraph;
  version: number;
  savedAt?: number;
}

let nextLocalVersion = 1;
/** Set while the store writes to the cache itself, so its own write isn't taken for a refetch. */
let isWritingCache = false;

const pendingSaves = new Map<string, PendingSave>();
const localGraphs = new Map<string, LocalGraph>();
const histories = new Map<string, WorkflowHistory>();
/** Why a workflow's latest edits are not saved, e.g. a step without a name. */
const saveProblems = new Map<string, string>();
/** Deleted workflows: a save still in flight for one fails quietly. */
const forgottenWorkflows = new Set<string>();
const storeListeners = new Set<() => void>();

// Local edits win over a refetch until the stored row includes them.
queryClient.getQueryCache().subscribe((event) => {
  if (isWritingCache || event.type !== "updated" || event.action.type !== "success") return;
  const data = event.query.state.data as ItemInfo | undefined;
  if (data?.type !== "workflow") return;
  const local = localGraphs.get(data.id);
  if (!local || data.data.graph === local.graph) return;
  if (local.savedAt !== undefined && data.updatedAt >= local.savedAt) {
    localGraphs.delete(data.id);
    return;
  }
  const graph = setCachedWorkflow({ ...data, data: { ...data.data, graph: local.graph } });
  localGraphs.set(data.id, { ...local, graph });
});

/** Writes a workflow to the cache and returns the graph object the cache now holds. */
function setCachedWorkflow(workflow: WorkflowInfo): WorkflowGraph {
  isWritingCache = true;
  try {
    queryClient.setQueryData<ItemInfo>(queryKeys.items.byId(workflow.id), workflow);
  } finally {
    isWritingCache = false;
  }
  const cached = queryClient.getQueryData<ItemInfo>(queryKeys.items.byId(workflow.id));
  return cached?.type === "workflow" ? cached.data.graph : workflow.data.graph;
}

export type WorkflowLoadState =
  | { status: "loading"; workflow: null }
  | { status: "missing"; workflow: null }
  | { status: "ready"; workflow: WorkflowInfo };

/**
 * The item cache is the editor's state: edits land there at once (so a chat
 * sidebar showing the same workflow follows along) and are written to disk
 * shortly after, coalesced. "missing" only once the item is known to be gone,
 * so nothing flashes as deleted while it loads.
 */
export function useWorkflowLoadState(workflowId: string | null): WorkflowLoadState {
  const query = useQuery(getItemQueryOptions(workflowId));
  // Read from the cache synchronously: `useQuery` re-renders a task after an
  // edit, and in between React puts a text field's old value back, which drops
  // keystrokes and wipes the field's native undo.
  const cached = React.useSyncExternalStore(subscribeToQueryCache, () =>
    workflowId ? queryClient.getQueryData<ItemInfo>(queryKeys.items.byId(workflowId)) : undefined,
  );
  if (!workflowId) return { status: "missing", workflow: null };
  const data = cached ?? query.data;
  if (query.status === "pending" && !data) return { status: "loading", workflow: null };
  // A failed refetch keeps the old data; an item fails to load once it is deleted.
  if (query.status === "error" || data?.type !== "workflow") {
    return { status: "missing", workflow: null };
  }
  return { status: "ready", workflow: data };
}

/**
 * Only item data changes: `useQuery` adds queries while components render,
 * and reacting to those would update this component mid-render.
 */
function subscribeToQueryCache(listener: () => void): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" && event.type !== "removed") return;
    if (event.query.queryKey[0] !== queryKeys.items.all[0]) return;
    listener();
  });
}

export function useWorkflow(workflowId: string): WorkflowInfo | null {
  return useWorkflowLoadState(workflowId).workflow;
}

export interface UpdateWorkflowGraphOptions {
  /** Edits sharing a key within a short pause undo as one step, e.g. typing in one field. */
  coalesceKey?: string;
}

export type UpdateWorkflowGraph = (
  update: (graph: WorkflowGraph) => WorkflowGraph,
  options?: UpdateWorkflowGraphOptions,
) => void;

/** Every edit goes through here, so each one lands in the workflow's undo history. */
export function updateWorkflowGraph(
  workflowId: string,
  update: (graph: WorkflowGraph) => WorkflowGraph,
  options?: UpdateWorkflowGraphOptions,
): void {
  const current = getCachedWorkflow(workflowId);
  if (!current) return;
  const graph = update(current.data.graph);
  if (graph === current.data.graph) return;

  setHistory(
    workflowId,
    recordWorkflowEdit(getHistory(workflowId), current.data.graph, {
      coalesceKey: options?.coalesceKey,
      now: Date.now(),
    }),
  );
  writeWorkflowGraph(current, graph);
}

export function undoWorkflowGraph(workflowId: string): void {
  const current = getCachedWorkflow(workflowId);
  const step = current && undoWorkflowEdit(getHistory(workflowId), current.data.graph);
  if (!current || !step) return;
  setHistory(workflowId, step.history);
  writeWorkflowGraph(current, step.graph);
}

export function redoWorkflowGraph(workflowId: string): void {
  const current = getCachedWorkflow(workflowId);
  const step = current && redoWorkflowEdit(getHistory(workflowId), current.data.graph);
  if (!current || !step) return;
  setHistory(workflowId, step.history);
  writeWorkflowGraph(current, step.graph);
}

/** The next edit starts its own undo step, e.g. once a text field loses focus. */
export function endWorkflowEditBurst(workflowId: string): void {
  setHistory(workflowId, endHistoryBurst(getHistory(workflowId)));
}

/** History is per workflow, so every pane showing it undoes the same edits. */
export function useWorkflowHistory(workflowId: string) {
  const history = React.useSyncExternalStore(subscribeToStore, () => getHistory(workflowId));
  return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

/** Why the latest edits are not saved; null when they are saved or on their way. */
export function useWorkflowSaveProblem(workflowId: string): string | null {
  return React.useSyncExternalStore(subscribeToStore, () => saveProblems.get(workflowId) ?? null);
}

/**
 * Drops everything kept for deleted workflows: undo history, the unsaved
 * graph and any save still waiting, which could only fail now.
 */
export function forgetWorkflows(workflowIds: readonly string[]): void {
  for (const workflowId of workflowIds) {
    const pending = pendingSaves.get(workflowId);
    if (pending) clearTimeout(pending.timer);
    pendingSaves.delete(workflowId);
    localGraphs.delete(workflowId);
    histories.delete(workflowId);
    saveProblems.delete(workflowId);
    forgottenWorkflows.add(workflowId);
  }
  notifyStore();
}

/** A workflow whose stored graph can't be read is never edited, so it is never overwritten. */
function getCachedWorkflow(workflowId: string): WorkflowInfo | null {
  const current = queryClient.getQueryData<ItemInfo>(queryKeys.items.byId(workflowId));
  return current?.type === "workflow" && !current.data.graphError ? current : null;
}

function writeWorkflowGraph(current: WorkflowInfo, graph: WorkflowGraph): void {
  const workflowId = current.id;
  const version = nextLocalVersion++;
  const cachedGraph = setCachedWorkflow({
    ...current,
    data: { ...current.data, graph },
    updatedAt: Date.now(),
  });
  localGraphs.set(workflowId, { graph: cachedGraph, version });

  // An invalid graph (e.g. a step name cleared halfway) stays local, and the
  // editor says so, until it is valid again.
  const problem = getWorkflowGraphProblem(graph);
  setSaveProblem(workflowId, problem);
  if (problem) return;
  const pending = pendingSaves.get(workflowId);
  if (pending) clearTimeout(pending.timer);
  pendingSaves.set(workflowId, {
    graph,
    version,
    timer: setTimeout(() => void flushWorkflowSave(workflowId), SAVE_DELAY_MS),
  });
}

function setSaveProblem(workflowId: string, problem: string | null): void {
  if ((saveProblems.get(workflowId) ?? null) === problem) return;
  if (problem) saveProblems.set(workflowId, problem);
  else saveProblems.delete(workflowId);
  notifyStore();
}

function getHistory(workflowId: string): WorkflowHistory {
  return histories.get(workflowId) ?? EMPTY_WORKFLOW_HISTORY;
}

function setHistory(workflowId: string, history: WorkflowHistory): void {
  if (histories.get(workflowId) === history) return;
  histories.set(workflowId, history);
  notifyStore();
}

function notifyStore(): void {
  for (const listener of storeListeners) listener();
}

function subscribeToStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

async function flushWorkflowSave(workflowId: string): Promise<void> {
  const pending = pendingSaves.get(workflowId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingSaves.delete(workflowId);
  try {
    // The reply is not written back: it would undo edits made while it was in
    // flight. Its time tells when a refetch has caught up with this graph.
    const saved = await workflowsApi.updateGraph(workflowId, pending.graph);
    const local = localGraphs.get(workflowId);
    if (local?.version === pending.version) {
      localGraphs.set(workflowId, { ...local, savedAt: saved.updatedAt });
    }
  } catch (error) {
    if (forgottenWorkflows.has(workflowId)) return;
    toastManager.add({
      type: "error",
      title: "Workflow could not be saved",
      description: error instanceof Error ? error.message : undefined,
    });
    localGraphs.delete(workflowId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.items.byId(workflowId) });
  }
}

/** Writes every unsaved edit; a chat request runs the workflow as stored. */
export function flushPendingWorkflowSaves(): Promise<void> {
  return Promise.all([...pendingSaves.keys()].map(flushWorkflowSave)).then(() => undefined);
}

/** Saves right away when the editor goes away instead of waiting out the delay. */
export function useFlushWorkflowOnUnmount(workflowId: string): void {
  React.useEffect(() => () => void flushWorkflowSave(workflowId), [workflowId]);
}
