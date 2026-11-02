import { describe, expect, it } from "vitest";

import { createWorkflowEdge, type WorkflowGraph } from "@shared/workflow/graph";

import {
  EMPTY_WORKFLOW_HISTORY,
  endWorkflowEditBurst,
  recordWorkflowEdit,
  redoWorkflowEdit,
  undoWorkflowEdit,
  WORKFLOW_EDIT_BURST_MS,
  type WorkflowHistory,
} from "./workflow-history";

/** Distinct graphs to tell snapshots apart. */
function graphs(count: number): WorkflowGraph[] {
  return Array.from({ length: count }, (_, index) => ({
    nodes: [],
    edges: [createWorkflowEdge(`step_${index}`, "output")],
  }));
}

describe("workflow history", () => {
  it("undoes and redoes edits in order", () => {
    const [a, b, c] = graphs(3);
    let history = recordWorkflowEdit(EMPTY_WORKFLOW_HISTORY, a!, { now: 0 });
    history = recordWorkflowEdit(history, b!, { now: 1000 });

    const first = undoWorkflowEdit(history, c!)!;
    expect(first.graph).toBe(b);
    const second = undoWorkflowEdit(first.history, b!)!;
    expect(second.graph).toBe(a);
    expect(undoWorkflowEdit(second.history, a!)).toBeNull();

    const redone = redoWorkflowEdit(second.history, a!)!;
    expect(redone.graph).toBe(b);
    expect(redoWorkflowEdit(redone.history, b!)!.graph).toBe(c);
  });

  it("coalesces a burst of same-key edits into one step", () => {
    const [a, b, c, d] = graphs(4);
    let history = recordWorkflowEdit(EMPTY_WORKFLOW_HISTORY, a!, { coalesceKey: "n:name", now: 0 });
    history = recordWorkflowEdit(history, b!, { coalesceKey: "n:name", now: 200 });
    // Each keystroke extends the pause window.
    history = recordWorkflowEdit(history, c!, { coalesceKey: "n:name", now: 600 });

    expect(history.past).toEqual([a]);
    expect(undoWorkflowEdit(history, d!)!.graph).toBe(a);
  });

  it("starts a new step after a pause, a different key, or the end of a burst", () => {
    const [a, b, c, d] = graphs(4);
    let history = recordWorkflowEdit(EMPTY_WORKFLOW_HISTORY, a!, { coalesceKey: "n:name", now: 0 });
    history = recordWorkflowEdit(history, b!, {
      coalesceKey: "n:name",
      now: WORKFLOW_EDIT_BURST_MS,
    });
    history = recordWorkflowEdit(history, c!, {
      coalesceKey: "n:prompt",
      now: WORKFLOW_EDIT_BURST_MS + 1,
    });
    history = endWorkflowEditBurst(history);
    history = recordWorkflowEdit(history, d!, {
      coalesceKey: "n:prompt",
      now: WORKFLOW_EDIT_BURST_MS + 2,
    });

    expect(history.past).toEqual([a, b, c, d]);
  });

  it("does not coalesce edits without a key", () => {
    const [a, b] = graphs(2);
    let history = recordWorkflowEdit(EMPTY_WORKFLOW_HISTORY, a!, { now: 0 });
    history = recordWorkflowEdit(history, b!, { now: 1 });
    expect(history.past).toEqual([a, b]);
  });

  it("clears redo after a new edit", () => {
    const [a, b, c] = graphs(3);
    const history = recordWorkflowEdit(EMPTY_WORKFLOW_HISTORY, a!, { now: 0 });
    const undone = undoWorkflowEdit(history, b!)!;
    expect(undone.history.future).toEqual([b]);

    const edited = recordWorkflowEdit(undone.history, a!, { now: 10 });
    expect(edited.future).toEqual([]);
    expect(redoWorkflowEdit(edited, c!)).toBeNull();
  });

  it("does not join an edit to a burst that undo interrupted", () => {
    const [a, b, c] = graphs(3);
    let history = recordWorkflowEdit(EMPTY_WORKFLOW_HISTORY, a!, { coalesceKey: "k", now: 0 });
    history = undoWorkflowEdit(history, b!)!.history;
    history = recordWorkflowEdit(history, a!, { coalesceKey: "k", now: 10 });
    expect(history.past).toEqual([a]);
    expect(undoWorkflowEdit(history, c!)!.graph).toBe(a);
  });

  it("keeps only the newest entries", () => {
    const snapshots = graphs(5);
    let history: WorkflowHistory = EMPTY_WORKFLOW_HISTORY;
    for (const [index, graph] of snapshots.entries()) {
      history = recordWorkflowEdit(history, graph, { now: index * 1000, limit: 3 });
    }
    expect(history.past).toEqual(snapshots.slice(-3));
  });
});
