import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";

import { closeAppDatabase, getAppDatabase } from "../db/database";
import { items, noteWordDays } from "../db/schema";
import { createWorkspace } from "../workspaces/repository";
import {
  createFolder,
  createMarkdown,
  deleteItem,
  getFolderById,
  getItemById,
  moveItem,
  updateItemTitle,
  updateMarkdownContent,
} from "./repository";
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
  const db = getAppDatabase();
  db.run(
    sql.raw(`
    create table workspaces (
      id text primary key,
      name text not null,
      color text,
      settings text not null default '{}',
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table folders (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      parent_id text references folders(id) on delete set null,
      name text not null,
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table items (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      folder_id text references folders(id) on delete set null,
      type text not null,
      title text not null,
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      word_count integer,
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table note_links (
      workspace_id text not null references workspaces(id) on delete cascade,
      from_item_id text not null references items(id) on delete cascade,
      to_item_id text references items(id) on delete set null,
      target_text text not null,
      alias text not null default '',
      primary key (from_item_id, target_text, alias)
    )
  `),
  );
  db.run(
    sql.raw(`
    create table note_word_days (
      item_id text not null references items(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      day text not null,
      start_words integer not null,
      end_words integer not null,
      updated_at integer not null,
      primary key (item_id, day)
    )
  `),
  );
  db.run(
    sql.raw(`
    create table folder_word_goals (
      folder_id text primary key references folders(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      target_words integer not null default 50000 check (target_words > 0),
      started_at integer not null,
      start_day text not null,
      baseline_words integer not null,
      pre_start_today integer not null default 0,
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
  delete process.env["HANOKI_USER_DATA_DIR"];
});

function prose(count: number): string {
  return Array.from({ length: count }, () => "word").join(" ");
}

function ledger(itemId: string) {
  return getAppDatabase().select().from(noteWordDays).where(eq(noteWordDays.itemId, itemId)).all();
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
    const note = createMarkdown({
      workspaceId: "midnight",
      title: "Chapter",
      folderId: folder.id,
    });
    updateMarkdownContent(note.id, prose(4));
    vi.setSystemTime(new Date(2026, 9, 9, 0, 5, 0));
    updateMarkdownContent(note.id, prose(6));
    const rows = ledger(note.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.day, row.startWords, row.endWords])).toEqual([
      ["2026-10-08", 0, 4],
      ["2026-10-09", 4, 6],
    ]);
  });

  it("floors today at 0 and floors since start at 0", () => {
    createWorkspace({ id: "floor", name: "Floor" });
    const folder = createFolder({ workspaceId: "floor", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "floor", title: "Chapter", folderId: folder.id });
    updateMarkdownContent(note.id, prose(10), "import");
    setFolderWordGoal(folder.id, 100);
    updateMarkdownContent(note.id, prose(2));
    const stats = getFolderWordGoalStats(folder.id);
    expect(stats?.today).toBe(0);
    expect(stats?.sinceStart).toBe(0);
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

  it("counts a moved-in note only for edits after it arrives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
    createWorkspace({ id: "move-in", name: "Move in" });
    const elsewhere = createFolder({ workspaceId: "move-in", name: "Elsewhere", parentId: null });
    const manuscript = createFolder({ workspaceId: "move-in", name: "Manuscript", parentId: null });
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

  it("drops moved-out notes and lowers since start when a note is deleted", () => {
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
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(10);
    moveItem(dropped.id, folder.id);
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(14);
    deleteItem(dropped.id);
    expect(ledger(dropped.id)).toEqual([]);
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(10);
  });

  it("counts subfolders toward the parent and shows the nearest goal", () => {
    createWorkspace({ id: "nested", name: "Nested" });
    const parent = createFolder({ workspaceId: "nested", name: "Book", parentId: null });
    const child = createFolder({ workspaceId: "nested", name: "Part", parentId: parent.id });
    const note = createMarkdown({ workspaceId: "nested", title: "Chapter", folderId: child.id });
    setFolderWordGoal(parent.id, 1000);
    setFolderWordGoal(child.id, 100);
    updateMarkdownContent(note.id, prose(7));
    expect(getNearestWordGoalForItem(note.id)?.folderId).toBe(child.id);
    expect(getFolderWordGoalStats(child.id)?.sinceStart).toBe(7);
    expect(getFolderWordGoalStats(parent.id)?.sinceStart).toBe(7);
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

  it("does not count an import as words written today", () => {
    createWorkspace({ id: "import", name: "Import" });
    const folder = createFolder({ workspaceId: "import", name: "Manuscript", parentId: null });
    const note = createMarkdown({ workspaceId: "import", title: "Chapter", folderId: folder.id });
    setFolderWordGoal(folder.id, 1000);
    updateMarkdownContent(note.id, prose(20), "import");
    expect(storedWordCount(note.id)).toBe(20);
    expect(ledger(note.id)).toEqual([]);
    expect(getFolderWordGoalStats(folder.id)?.today).toBe(0);
    expect(getFolderWordGoalStats(folder.id)?.sinceStart).toBe(0);
  });

  it("keeps a rename rewrite neutral", () => {
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
    expect(backfillWordCounts(10)).toBe(pending.length);
    expect(storedWordCount(note.id)).toBe(6);
    expect(getItemById(note.id)?.updatedAt).toBe(updatedAt);
    expect(getFolderById(folder.id)?.updatedAt).toBe(folderUpdatedAt);
  });

  it("uses the old body when the first counted edit has a null word count", () => {
    createWorkspace({ id: "null-count", name: "Null count" });
    const folder = createFolder({ workspaceId: "null-count", name: "Manuscript", parentId: null });
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
    expect(getFolderWordGoalStats(folder.id)).toBeNull();
  });
});
