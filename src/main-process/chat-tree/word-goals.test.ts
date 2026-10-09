import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, asc, eq, isNull } from "drizzle-orm";

import { MAX_WORD_GOAL_TARGET } from "@shared/markdown/word-goal";

import { closeAppDatabase, getAppDatabase, initializeAppDatabase } from "../db/database";
import { items, noteWordDays } from "../db/schema";
import { importMarkdownNotesFromDirectory } from "../notes-folder-io/import-notes";
import { createChatTreeService } from "../services/chat-tree-service";
import { createWorkspace } from "../workspaces/repository";
import {
  createFolder,
  createMarkdown,
  deleteItem,
  getFolderById,
  getItemById,
  moveFolder,
  moveItem,
  updateItemTitle,
  updateMarkdownContent,
} from "./repository";
import * as chatTreeRepository from "./repository";
import {
  backfillWordCounts,
  clearFolderWordGoal,
  getFolderWordGoalStats,
  getNearestWordGoalForItem,
  setFolderWordGoal,
} from "./word-goals";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-word-goals-"));

beforeAll(() => {
  process.env["HANOKI_USER_DATA_DIR"] = testDataDirectory;
  process.env["HANOKI_MIGRATIONS_DIR"] = resolve("src/main-process/db/migrations");
  initializeAppDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
  delete process.env["HANOKI_USER_DATA_DIR"];
  delete process.env["HANOKI_MIGRATIONS_DIR"];
});

function prose(count: number): string {
  return Array.from({ length: count }, () => "word").join(" ");
}

function ledger(itemId: string) {
  return getAppDatabase()
    .select()
    .from(noteWordDays)
    .where(eq(noteWordDays.itemId, itemId))
    .orderBy(asc(noteWordDays.day), asc(noteWordDays.folderId))
    .all();
}

function storedWordCount(itemId: string): number | null {
  return (
    getAppDatabase()
      .select({ wordCount: items.wordCount })
      .from(items)
      .where(eq(items.id, itemId))
      .get()?.wordCount ?? null
  );
}

describe("folder word goals", () => {
  it("records the first save as the day's start and later saves only move the end", () => {
    createWorkspace({ id: "ledger", name: "Ledger" });
    const folder = createFolder({ workspaceId: "ledger", name: "Manuscript", parentId: null });
    setFolderWordGoal(folder.id, 1000);
    const note = createMarkdown({ workspaceId: "ledger", title: "Chapter", folderId: folder.id });

    updateMarkdownContent(note.id, prose(3));
    expect(ledger(note.id)).toMatchObject([{ startWords: 0, endWords: 3 }]);

    updateMarkdownContent(note.id, prose(5));
    expect(ledger(note.id)).toMatchObject([{ startWords: 0, endWords: 5 }]);
  });

  it("starts a new row after local midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 22, 0, 0));
    createWorkspace({ id: "midnight", name: "Midnight" });
    const folder = createFolder({ workspaceId: "midnight", name: "Manuscript", parentId: null });
    setFolderWordGoal(folder.id, 1000);
    const note = createMarkdown({
      workspaceId: "midnight",
      title: "Chapter",
      folderId: folder.id,
    });
    updateMarkdownContent(note.id, prose(4));
    vi.setSystemTime(new Date(2026, 9, 9, 0, 5, 0));
    updateMarkdownContent(note.id, prose(6));
    const rows = ledger(note.id);
    expect(rows.map((row) => [row.day, row.startWords, row.endWords])).toEqual([
      ["2026-10-08", 0, 4],
      ["2026-10-09", 4, 6],
    ]);
  });

  it("counts a new note in full and ignores words written before the goal on the start day", () => {
    createWorkspace({ id: "prestart", name: "Prestart" });
    const folder = createFolder({ workspaceId: "prestart", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "prestart", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(10));
    setFolderWordGoal(folder.id, 50_000);
    updateMarkdownContent(note.id, prose(15));
    const fresh = createMarkdown({ workspaceId: "prestart", title: "Fresh", folderId: folder.id });
    updateMarkdownContent(fresh.id, prose(4));
    const stats = getFolderWordGoalStats(folder.id);
    expect(stats?.today).toBe(19);
    expect(stats?.sinceStart).toBe(9);
  });

  it("keeps pre-goal words out of since start after the note leaves", () => {
    createWorkspace({ id: "repro", name: "Repro" });
    const folder = createFolder({ workspaceId: "repro", name: "Manuscript", parentId: null });
    const elsewhere = createFolder({ workspaceId: "repro", name: "Loose", parentId: null });
    const note = createMarkdown({ workspaceId: "repro", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(300));
    setFolderWordGoal(folder.id, 50_000);
    expect(getFolderWordGoalStats(folder.id)).toMatchObject({ today: 300, sinceStart: 0 });
    moveItem(note.id, elsewhere.id);
    const other = createMarkdown({ workspaceId: "repro", title: "Other", folderId: folder.id });
    updateMarkdownContent(other.id, prose(200));
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(200);
    expect(getFolderWordGoalStats(folder.id)?.today).toBe(500);
  });

  it("does not inflate since start when words were deleted before the goal", () => {
    createWorkspace({ id: "trim", name: "Trim" });
    const folder = createFolder({ workspaceId: "trim", name: "Manuscript", parentId: null });
    const elsewhere = createFolder({ workspaceId: "trim", name: "Loose", parentId: null });
    const note = createMarkdown({ workspaceId: "trim", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(300));
    updateMarkdownContent(note.id, prose(100));
    setFolderWordGoal(folder.id, 50_000);
    moveItem(note.id, elsewhere.id);
    const other = createMarkdown({ workspaceId: "trim", title: "Other", folderId: folder.id });
    updateMarkdownContent(other.id, prose(200));
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(200);
  });

  it("drops a deleted note from since start and from today", () => {
    createWorkspace({ id: "gone", name: "Gone" });
    const folder = createFolder({ workspaceId: "gone", name: "Manuscript", parentId: null });
    setFolderWordGoal(folder.id, 1000);
    const note = createMarkdown({ workspaceId: "gone", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(300));
    const other = createMarkdown({ workspaceId: "gone", title: "Other", folderId: folder.id });
    updateMarkdownContent(other.id, prose(50));
    deleteItem(note.id);
    expect(ledger(note.id)).toEqual([]);
    expect(getFolderWordGoalStats(folder.id)).toMatchObject({ sinceStart: 50, today: 50 });
  });

  it("counts a moved-in note only for edits after it arrives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
    createWorkspace({ id: "move-in", name: "Move in" });
    const elsewhere = createFolder({ workspaceId: "move-in", name: "Elsewhere", parentId: null });
    const manuscript = createFolder({
      workspaceId: "move-in",
      name: "Manuscript",
      parentId: null,
    });
    const note = createMarkdown({
      workspaceId: "move-in",
      title: "Chapter",
      folderId: elsewhere.id,
    });
    updateMarkdownContent(note.id, prose(8));
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    setFolderWordGoal(manuscript.id, 1000);
    moveItem(note.id, manuscript.id);
    expect(getFolderWordGoalStats(manuscript.id)?.sinceStart).toBe(0);
    updateMarkdownContent(note.id, prose(11));
    expect(getFolderWordGoalStats(manuscript.id)?.sinceStart).toBe(3);
    expect(getFolderWordGoalStats(manuscript.id)?.today).toBe(3);
  });

  it("leaves today words in the folder where they were written", () => {
    createWorkspace({ id: "carry", name: "Carry" });
    const left = createFolder({ workspaceId: "carry", name: "Left", parentId: null });
    const right = createFolder({ workspaceId: "carry", name: "Right", parentId: null });
    setFolderWordGoal(left.id, 1000);
    setFolderWordGoal(right.id, 1000);
    const note = createMarkdown({ workspaceId: "carry", title: "Chapter", folderId: left.id });
    updateMarkdownContent(note.id, prose(400));
    moveItem(note.id, right.id);
    expect(getFolderWordGoalStats(left.id)).toMatchObject({ today: 400, sinceStart: 0 });
    expect(getFolderWordGoalStats(right.id)).toMatchObject({ today: 0, sinceStart: 0 });
    updateMarkdownContent(note.id, prose(450));
    expect(getFolderWordGoalStats(left.id)).toMatchObject({ today: 400, sinceStart: 0 });
    expect(getFolderWordGoalStats(right.id)).toMatchObject({ today: 50, sinceStart: 50 });
  });

  it("drops moved-out notes from since start and resets the baseline when they return", () => {
    createWorkspace({ id: "delete", name: "Delete" });
    const folder = createFolder({ workspaceId: "delete", name: "Manuscript", parentId: null });
    setFolderWordGoal(folder.id, 1000);
    const kept = createMarkdown({ workspaceId: "delete", title: "Kept", folderId: folder.id });
    const dropped = createMarkdown({
      workspaceId: "delete",
      title: "Dropped",
      folderId: folder.id,
    });
    updateMarkdownContent(kept.id, prose(10));
    updateMarkdownContent(dropped.id, prose(4));
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(14);
    moveItem(dropped.id, null);
    expect(getFolderWordGoalStats(folder.id)).toMatchObject({ sinceStart: 10, today: 14 });
    moveItem(dropped.id, folder.id);
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(10);
    deleteItem(dropped.id);
    expect(ledger(dropped.id)).toEqual([]);
    expect(getFolderWordGoalStats(folder.id)).toMatchObject({ sinceStart: 10, today: 10 });
  });

  it("counts subfolders toward the parent and shows the nearest goal", () => {
    createWorkspace({ id: "nested", name: "Nested" });
    const parent = createFolder({ workspaceId: "nested", name: "Book", parentId: null });
    const child = createFolder({ workspaceId: "nested", name: "Part", parentId: parent.id });
    setFolderWordGoal(parent.id, 1000);
    setFolderWordGoal(child.id, 100);
    const note = createMarkdown({ workspaceId: "nested", title: "Chapter", folderId: child.id });
    updateMarkdownContent(note.id, prose(7));
    expect(getNearestWordGoalForItem(note.id)?.folderId).toBe(child.id);
    expect(getFolderWordGoalStats(child.id)?.sinceStart).toBe(7);
    expect(getFolderWordGoalStats(parent.id)?.sinceStart).toBe(7);
    const outside = createFolder({ workspaceId: "nested", name: "Outside", parentId: null });
    moveFolder(child.id, outside.id);
    expect(getFolderWordGoalStats(parent.id)).toMatchObject({ sinceStart: 0, today: 7 });
    expect(getFolderWordGoalStats(child.id)?.sinceStart).toBe(7);
    const rootNote = createMarkdown({ workspaceId: "nested", title: "Root", folderId: null });
    expect(getNearestWordGoalForItem(rootNote.id)).toBeNull();
  });

  it("keeps item and folder timestamps when a goal is set, edited, or cleared", () => {
    createWorkspace({ id: "stamps", name: "Stamps" });
    const folder = createFolder({ workspaceId: "stamps", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "stamps", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(2));
    const noteUpdatedAt = getItemById(note.id)?.updatedAt;
    const folderUpdatedAt = getFolderById(folder.id)?.updatedAt;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
    const created = setFolderWordGoal(folder.id, 1000);
    vi.setSystemTime(new Date(2026, 9, 2, 9, 0, 0));
    const edited = setFolderWordGoal(folder.id, 2000);
    expect(edited.startedAt).toBe(created.startedAt);
    expect(edited.targetWords).toBe(2000);
    expect(getItemById(note.id)?.updatedAt).toBe(noteUpdatedAt);
    expect(getFolderById(folder.id)?.updatedAt).toBe(folderUpdatedAt);
    clearFolderWordGoal(folder.id);
    expect(getFolderWordGoalStats(folder.id)).toBeNull();
    vi.setSystemTime(new Date(2026, 9, 3, 9, 0, 0));
    const reset = setFolderWordGoal(folder.id, 3000);
    expect(reset.startedAt).not.toBe(created.startedAt);
    expect(getItemById(note.id)?.updatedAt).toBe(noteUpdatedAt);
    expect(getFolderById(folder.id)?.updatedAt).toBe(folderUpdatedAt);
  });

  it("rejects a target above the cap", () => {
    createWorkspace({ id: "cap", name: "Cap" });
    const folder = createFolder({ workspaceId: "cap", name: "Manuscript", parentId: null });
    expect(() => setFolderWordGoal(folder.id, MAX_WORD_GOAL_TARGET + 1)).toThrow(/10,000,000/);
  });

  it("does not bump updatedAt or write a day row when the body is unchanged", () => {
    createWorkspace({ id: "same", name: "Same" });
    const folder = createFolder({ workspaceId: "same", name: "Manuscript", parentId: null });
    setFolderWordGoal(folder.id, 1000);
    const note = createMarkdown({ workspaceId: "same", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(4));
    const updatedAt = getItemById(note.id)?.updatedAt;
    const rows = ledger(note.id);
    updateMarkdownContent(note.id, prose(4));
    expect(getItemById(note.id)?.updatedAt).toBe(updatedAt);
    expect(ledger(note.id)).toEqual(rows);
  });

  it("imports through the real importer without counting the words", async () => {
    createWorkspace({ id: "import", name: "Import" });
    const source = mkdtempSync(join(tmpdir(), "hanoki-goal-import-"));
    mkdirSync(join(source, "Manuscript"));
    writeFileSync(join(source, "Manuscript", "Chapter.md"), prose(20));
    const service = createChatTreeService();
    const result = await importMarkdownNotesFromDirectory(
      {
        createFolder(input) {
          const folder = service.createFolder(input);
          setFolderWordGoal(folder.id, 1000);
          return folder;
        },
        createMarkdown: (input) => service.createMarkdown(input),
        queueMarkdownContent: (id, markdown, countMode) =>
          service.queueMarkdownContent(id, markdown, countMode),
        flushMarkdownContent: (id) => service.flushMarkdownContent(id),
        rebuildNoteLinks: (workspaceId) => service.rebuildNoteLinks(workspaceId),
      },
      "import",
      source,
    );
    rmSync(source, { recursive: true, force: true });
    expect(result.noteCount).toBe(1);
    const note = getAppDatabase()
      .select()
      .from(items)
      .where(and(eq(items.workspaceId, "import"), eq(items.type, "markdown")))
      .get();
    expect(note).toBeTruthy();
    expect(storedWordCount(note!.id)).toBe(20);
    expect(ledger(note!.id)).toEqual([]);
    expect(getFolderWordGoalStats(note!.folderId!)).toMatchObject({ today: 0, sinceStart: 0 });
  });

  it("keeps a rename rewrite neutral through updateItemTitle", () => {
    createWorkspace({ id: "rename", name: "Rename" });
    const folder = createFolder({ workspaceId: "rename", name: "Manuscript", parentId: null });
    const target = createMarkdown({ workspaceId: "rename", title: "Old", folderId: folder.id });
    const source = createMarkdown({ workspaceId: "rename", title: "Source", folderId: folder.id });
    setFolderWordGoal(folder.id, 1000);
    updateMarkdownContent(source.id, "hello [[Old]]");
    const before = getFolderWordGoalStats(folder.id);
    updateItemTitle(target.id, "Brand New");
    const after = getFolderWordGoalStats(folder.id);
    expect(getItemById(source.id)?.data).toMatchObject({ markdown: "hello [[Brand New]]" });
    expect(after?.today).toBe(before?.today);
    expect(after?.sinceStart).toBe(before?.sinceStart);
    expect(storedWordCount(source.id)).toBe(3);
  });

  it("backfills a missing count without touching updated_at", () => {
    createWorkspace({ id: "backfill", name: "Backfill" });
    const folder = createFolder({ workspaceId: "backfill", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "backfill", title: "Chapter", folderId: folder.id });
    const updatedAt = getItemById(note.id)?.updatedAt;
    const folderUpdatedAt = getFolderById(folder.id)?.updatedAt;
    getAppDatabase()
      .update(items)
      .set({ data: { markdown: prose(6) }, wordCount: null })
      .where(eq(items.id, note.id))
      .run();
    const pending = getAppDatabase()
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.type, "markdown"), isNull(items.wordCount)))
      .all();
    expect(pending.some((row) => row.id === note.id)).toBe(true);
    expect(backfillWordCounts(pending.length)).toBe(pending.length);
    expect(storedWordCount(note.id)).toBe(6);
    expect(getItemById(note.id)?.updatedAt).toBe(updatedAt);
    expect(getFolderById(folder.id)?.updatedAt).toBe(folderUpdatedAt);
  });

  it("uses the old body when the first counted edit has a null word count", () => {
    createWorkspace({ id: "null-count", name: "Null count" });
    const folder = createFolder({ workspaceId: "null-count", name: "Manuscript", parentId: null });
    setFolderWordGoal(folder.id, 1000);
    const note = createMarkdown({
      workspaceId: "null-count",
      title: "Chapter",
      folderId: folder.id,
    });
    getAppDatabase()
      .update(items)
      .set({ data: { markdown: prose(4) }, wordCount: null })
      .where(eq(items.id, note.id))
      .run();
    updateMarkdownContent(note.id, prose(6));
    expect(ledger(note.id)).toMatchObject([{ startWords: 4, endWords: 6 }]);
  });

  it("sets a goal without counting null bodies, and an autosave stays under 10 ms at 20k notes", () => {
    createWorkspace({ id: "perf", name: "Perf" });
    const folder = createFolder({ workspaceId: "perf", name: "Manuscript", parentId: null });
    const sqlite = getAppDatabase().$client;
    const insert = sqlite.prepare(
      `INSERT INTO items (
        id, workspace_id, folder_id, type, title, data, metadata, extensions, word_count, created_at, updated_at
      ) VALUES (?, 'perf', ?, 'markdown', ?, '{"markdown":"word"}', '{}', '{}', 1, 1, 1)`,
    );
    sqlite.exec("BEGIN");
    for (let index = 0; index < 20_000; index += 1) {
      insert.run(`perf-note-${index}`, folder.id, `Note ${index}`);
    }
    sqlite.exec("COMMIT");
    const pending = createMarkdown({ workspaceId: "perf", title: "Pending", folderId: folder.id });
    getAppDatabase()
      .update(items)
      .set({ data: { markdown: prose(40) }, wordCount: null })
      .where(eq(items.id, pending.id))
      .run();

    const setStarted = performance.now();
    setFolderWordGoal(folder.id, 50_000);
    expect(performance.now() - setStarted).toBeLessThan(500);
    expect(storedWordCount(pending.id)).toBeNull();

    const sample = "perf-note-0";
    updateMarkdownContent(sample, prose(8));
    const samples: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const started = performance.now();
      updateMarkdownContent(sample, prose(8 + index));
      samples.push(performance.now() - started);
    }
    samples.sort((left, right) => left - right);
    expect(samples[2]).toBeLessThan(10);
  });

  it("agrees on a known delta across the ledger, footer stats, and popover stats", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
    createWorkspace({ id: "agree", name: "Agree" });
    const folder = createFolder({ workspaceId: "agree", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "agree", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(120));
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    setFolderWordGoal(folder.id, 1000);
    const service = createChatTreeService();
    service.queueMarkdownContent(note.id, prose(125));

    const popover = service.getFolderWordGoalStats(folder.id);
    const footer = service.getNearestWordGoalForItem(note.id);
    const rows = ledger(note.id).filter((row) => row.day === "2026-10-09");
    const delta = rows.reduce((sum, row) => sum + (row.endWords - row.startWords), 0);

    expect(rows).toMatchObject([{ startWords: 120, endWords: 125 }]);
    expect(delta).toBe(5);
    expect(popover).toMatchObject({ sinceStart: delta, today: delta });
    expect(footer).toMatchObject({ sinceStart: delta, today: delta });
  });

  it("returns the last saved goal stats when a pending save cannot be flushed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
    createWorkspace({ id: "flush-fail", name: "Flush" });
    const folder = createFolder({ workspaceId: "flush-fail", name: "Manuscript", parentId: null });
    const note = createMarkdown({
      workspaceId: "flush-fail",
      title: "Chapter",
      folderId: folder.id,
    });
    updateMarkdownContent(note.id, prose(120));
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    setFolderWordGoal(folder.id, 1000);
    const service = createChatTreeService();
    const update = vi.spyOn(chatTreeRepository, "updateMarkdownContent").mockImplementation(() => {
      throw new Error("disk full");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.queueMarkdownContent(note.id, prose(125));

    expect(service.getNearestWordGoalForItem(note.id)).toMatchObject({ sinceStart: 0, today: 0 });
    expect(service.getFolderWordGoalStats(folder.id)).toMatchObject({ sinceStart: 0, today: 0 });
    expect(logged).toHaveBeenCalled();
    logged.mockClear();
    expect(service.getNearestWordGoalForItem(note.id)).toMatchObject({ sinceStart: 0, today: 0 });
    expect(logged).not.toHaveBeenCalled();

    update.mockRestore();
    vi.advanceTimersByTime(1000);
    expect(service.getNearestWordGoalForItem(note.id)).toMatchObject({ sinceStart: 5, today: 5 });
    expect(ledger(note.id).filter((row) => row.day === "2026-10-09")).toMatchObject([
      { startWords: 120, endWords: 125 },
    ]);
    logged.mockRestore();
  });

  it("backs off a failing autosave and logs at most once a minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    createWorkspace({ id: "backoff", name: "Backoff" });
    const folder = createFolder({ workspaceId: "backoff", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "backoff", title: "Chapter", folderId: folder.id });
    const service = createChatTreeService();
    const update = vi.spyOn(chatTreeRepository, "updateMarkdownContent").mockImplementation(() => {
      throw new Error("disk full");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.queueMarkdownContent(note.id, prose(3));

    const attempts = [500, 1_000, 2_000, 4_000, 8_000, 16_000];
    for (const [index, delay] of attempts.entries()) {
      vi.advanceTimersByTime(delay - 1);
      expect(update).toHaveBeenCalledTimes(index);
      vi.advanceTimersByTime(1);
      expect(update).toHaveBeenCalledTimes(index + 1);
    }
    expect(logged).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(29_999);
    expect(update).toHaveBeenCalledTimes(attempts.length);
    vi.advanceTimersByTime(1);
    expect(update).toHaveBeenCalledTimes(attempts.length + 1);
    expect(logged).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_000);
    expect(update).toHaveBeenCalledTimes(attempts.length + 2);
    expect(logged).toHaveBeenCalledTimes(2);

    update.mockRestore();
    logged.mockRestore();
  });

  it("resets autosave backoff after a successful save", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    createWorkspace({ id: "backoff-reset", name: "Backoff reset" });
    const folder = createFolder({
      workspaceId: "backoff-reset",
      name: "Manuscript",
      parentId: null,
    });
    const note = createMarkdown({
      workspaceId: "backoff-reset",
      title: "Chapter",
      folderId: folder.id,
    });
    const service = createChatTreeService();
    const update = vi.spyOn(chatTreeRepository, "updateMarkdownContent").mockImplementation(() => {
      throw new Error("disk full");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.queueMarkdownContent(note.id, prose(4));
    for (const delay of [500, 1_000, 2_000, 4_000, 8_000, 16_000]) {
      vi.advanceTimersByTime(delay);
    }
    expect(update).toHaveBeenCalledTimes(6);

    update.mockRestore();
    vi.advanceTimersByTime(30_000);
    expect(service.getItem(note.id).data).toMatchObject({ markdown: prose(4) });

    const again = vi.spyOn(chatTreeRepository, "updateMarkdownContent").mockImplementation(() => {
      throw new Error("disk full");
    });
    service.queueMarkdownContent(note.id, prose(5));
    vi.advanceTimersByTime(500);
    expect(again).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    expect(again).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(again).toHaveBeenCalledTimes(2);
    again.mockRestore();
    logged.mockRestore();
  });

  it("drops a pending autosave when the note no longer exists", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0, 0));
    createWorkspace({ id: "backoff-gone", name: "Backoff gone" });
    const folder = createFolder({
      workspaceId: "backoff-gone",
      name: "Manuscript",
      parentId: null,
    });
    const note = createMarkdown({
      workspaceId: "backoff-gone",
      title: "Chapter",
      folderId: folder.id,
    });
    const service = createChatTreeService();
    const update = vi.spyOn(chatTreeRepository, "updateMarkdownContent").mockImplementation(() => {
      throw new Error("disk full");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.queueMarkdownContent(note.id, prose(2));
    vi.advanceTimersByTime(500);
    expect(update).toHaveBeenCalledTimes(1);

    deleteItem(note.id);
    vi.advanceTimersByTime(60_000);
    expect(update).toHaveBeenCalledTimes(1);
    update.mockRestore();
    logged.mockRestore();
  });
});
