// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotesFolderImportResult } from "@shared/markdown/folder-io";

import { queryClient } from "@/lib/query-client";
import { notifyChatTreeChanged } from "@/features/items/item-title-events";
import { notesImportUi } from "@/features/settings/notes-folder-import-dialog";

import { applyImportedNotesResult } from "./markdown";

function imported(noteCount: number): Extract<NotesFolderImportResult, { status: "imported" }> {
  return {
    status: "imported",
    folderPath: "/vault",
    wrapFolderPath: "Imported/Vault",
    noteCount,
    folderCount: 2,
    skippedCount: 0,
    skippedDuplicatePathCount: 0,
    skippedPaths: [],
    failedCount: 0,
    failures: [],
    canceled: noteCount < 20_000,
    skippedOversizedCount: 0,
    ignoredNonMarkdownCount: 0,
    ignoredDirectoryNames: [],
    warnings: [],
  };
}

afterEach(() => {
  notesImportUi.reset();
});

describe("applyImportedNotesResult", () => {
  it("shows the summary before one tree refresh, including after cancel", async () => {
    const refreshTree = vi.fn();
    applyImportedNotesResult(imported(16_200), "workspace-1", refreshTree);

    expect(notesImportUi.getSnapshot()).toMatchObject({
      phase: "summary",
      result: { canceled: true, noteCount: 16_200 },
    });
    expect(refreshTree).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    expect(refreshTree).toHaveBeenCalledTimes(1);
    expect(refreshTree).toHaveBeenCalledWith("workspace-1");
  });

  it("refreshes once for a 20k import", async () => {
    const refreshTree = vi.fn();
    applyImportedNotesResult(imported(20_000), "workspace-1", refreshTree);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    expect(refreshTree).toHaveBeenCalledTimes(1);
    expect(notesImportUi.getSnapshot().phase).toBe("summary");
  });
});

describe("notifyChatTreeChanged", () => {
  it("invalidates a fixed set of query prefixes", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    notifyChatTreeChanged("workspace-1");
    expect(invalidate.mock.calls.length).toBeGreaterThan(0);
    expect(invalidate.mock.calls.length).toBeLessThanOrEqual(8);
    invalidate.mockRestore();
  });
});
