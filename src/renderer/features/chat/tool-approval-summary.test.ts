import { describe, expect, it } from "vitest";

import {
  formatHanokiKindCounts,
  formatHanokiMoveApproval,
  formatHanokiRenameApproval,
} from "./tool-approval-summary";

describe("formatHanokiKindCounts", () => {
  it("groups mixed kinds with counts", () => {
    expect(formatHanokiKindCounts(["chat", "markdown", "markdown", "folder"])).toBe(
      "1 chat, 2 notes, and 1 folder",
    );
  });
});

describe("formatHanokiMoveApproval", () => {
  it("summarizes kinds and a named destination", () => {
    expect(
      formatHanokiMoveApproval(
        {
          items: [
            { kind: "chat", id: "c1" },
            { kind: "terminal", id: "t1" },
          ],
          destinationFolderId: "folder-1",
        },
        "Archive",
      ),
    ).toEqual({
      title: "Move these Hanoki items?",
      summary: "1 chat and 1 terminal",
      destination: "“Archive”",
    });
  });

  it("uses workspace root when the destination is null", () => {
    expect(
      formatHanokiMoveApproval(
        { items: [{ kind: "markdown", id: "n1" }], destinationFolderId: null },
        null,
      ),
    ).toEqual({
      title: "Move this Hanoki item?",
      summary: "1 note",
      destination: "the workspace root",
    });
  });

  it("falls back to a folder when the destination name is unknown", () => {
    expect(
      formatHanokiMoveApproval(
        { items: [{ kind: "folder", id: "f1" }], destinationFolderId: "missing" },
        null,
      ),
    ).toEqual({
      title: "Move this Hanoki item?",
      summary: "1 folder",
      destination: "a folder",
    });
  });
});

describe("formatHanokiRenameApproval", () => {
  it("shows kind in the title and before→after names", () => {
    expect(
      formatHanokiRenameApproval({ kind: "markdown", id: "n1", newName: "Weekly" }, "Draft"),
    ).toEqual({
      title: "Rename this note?",
      kindLabel: "note",
      before: "Draft",
      after: "Weekly",
    });
  });

  it("omits before when the current name is unknown", () => {
    expect(
      formatHanokiRenameApproval({ kind: "chat", id: "c1", newName: "Planning" }, null),
    ).toEqual({
      title: "Rename this chat?",
      kindLabel: "chat",
      before: null,
      after: "Planning",
    });
  });
});
