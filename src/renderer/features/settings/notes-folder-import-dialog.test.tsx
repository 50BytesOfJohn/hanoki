// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotesFolderImportResult } from "@shared/markdown/folder-io";

import { NotesFolderImportDialog, notesImportUi } from "./notes-folder-import-dialog";

type Imported = Extract<NotesFolderImportResult, { status: "imported" }>;

function imported(canceled: boolean): Imported {
  return {
    status: "imported",
    folderPath: "/vault",
    wrapFolderPath: "Imported/Vault",
    noteCount: 10,
    folderCount: 1,
    skippedCount: 0,
    skippedDuplicatePathCount: 0,
    skippedPaths: [],
    failedCount: canceled ? 0 : 1,
    failures: canceled
      ? []
      : [{ relativePath: "bad.md", reason: "bad.md could not be read: File is not valid UTF-8." }],
    canceled,
    skippedOversizedCount: 0,
    ignoredNonMarkdownCount: 0,
    ignoredDirectoryNames: [],
    warnings: [],
  };
}

function showRunningDialog(): void {
  notesImportUi.begin();
  notesImportUi.progress({
    type: "markdown:import-progress",
    workspaceId: "workspace-1",
    folderPath: "/vault",
    index: 10,
    total: 3000,
    relativePath: "n.md",
  });
  render(<NotesFolderImportDialog />);
}

beforeEach(() => {
  notesImportUi.reset();
  window.electronAPI = {
    onSystemEvent: () => () => {},
    cancelMarkdownNotesImport: vi.fn(async () => undefined),
  } as unknown as Window["electronAPI"];
});

afterEach(() => {
  cleanup();
  notesImportUi.reset();
});

describe("NotesFolderImportDialog", () => {
  it("switches to Canceling as soon as Cancel or Escape is used", () => {
    showRunningDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Canceling…" })).toBeTruthy();

    cleanup();
    notesImportUi.reset();
    showRunningDialog();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Canceling…" })).toBeTruthy();
    expect(window.electronAPI.cancelMarkdownNotesImport).toHaveBeenCalled();
  });

  it("keeps the summary after cancel until Done", async () => {
    showRunningDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await act(async () => {
      notesImportUi.finish(imported(true));
    });

    expect(screen.getByText("Import canceled")).toBeTruthy();
    fireEvent.click(document.querySelector("[data-slot='dialog-overlay']")!);
    expect(screen.getByText("Import canceled")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Import canceled")).toBeNull();
  });

  it("keeps a finished import summary until Done", async () => {
    showRunningDialog();

    await act(async () => {
      notesImportUi.finish(imported(false));
    });

    expect(screen.getByText("Notes imported")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Failures (1)" })).toBeTruthy();
    expect(screen.queryByText(/File is not valid UTF-8/)).toBeNull();
    fireEvent.click(document.querySelector("[data-slot='dialog-overlay']")!);
    expect(screen.getByText("Notes imported")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Notes imported")).toBeNull();
  });

  it("shows Linking notes after the copy counter", () => {
    notesImportUi.begin();
    notesImportUi.progress({
      type: "markdown:import-progress",
      workspaceId: "workspace-1",
      folderPath: "/vault",
      index: 20,
      total: 20,
      relativePath: "",
      step: "linking",
    });
    render(<NotesFolderImportDialog />);

    expect(screen.getByText("Linking notes…")).toBeTruthy();
    expect(screen.queryByText("Importing… 20 of 20")).toBeNull();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(window.electronAPI.cancelMarkdownNotesImport).not.toHaveBeenCalled();
    expect(screen.getByText("Linking notes…")).toBeTruthy();
  });

  it("titles an empty import and keeps the ignored counts", async () => {
    showRunningDialog();

    await act(async () => {
      notesImportUi.finish({
        ...imported(false),
        noteCount: 0,
        failedCount: 0,
        failures: [],
        ignoredNonMarkdownCount: 2,
        ignoredDirectoryNames: [".obsidian"],
      });
    });

    expect(screen.getByText("No notes imported")).toBeTruthy();
    expect(screen.queryByText("Notes imported")).toBeNull();
    expect(screen.getByText("Nothing was copied.")).toBeTruthy();
    expect(screen.getByText(/2 non-markdown files ignored/)).toBeTruthy();
    expect(screen.getByText(/Ignored \.obsidian\//)).toBeTruthy();
  });
});
