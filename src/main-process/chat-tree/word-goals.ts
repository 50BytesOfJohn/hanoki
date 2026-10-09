import { and, eq, isNull } from "drizzle-orm";
import type { DatabaseSync } from "node:sqlite";

import type { FolderWordGoalStats } from "@shared/ipc";
import { localDayKey } from "@shared/markdown/day-key";
import { MAX_WORD_GOAL_TARGET } from "@shared/markdown/word-goal";
import { countMarkdownWords } from "@shared/markdown/word-count";

import { getAppDatabase, type AppDatabase } from "../db/database";
import { folderWordGoals, folders, items, noteWordDays } from "../db/schema";

/**
 * HAN-32 version restore must pass "neutral" so restored text does not count as words written.
 */
export type WordCountMode = "edit" | "neutral" | "import";

const BACKFILL_CHUNK = 200;

type WordCountDb = Pick<AppDatabase, "insert" | "select" | "update" | "delete" | "transaction">;

export function writeMarkdownWordCount(id: string, markdown: string, mode: WordCountMode): boolean {
  const db = getAppDatabase();
  return db.transaction((tx) => {
    const item = tx.select().from(items).where(eq(items.id, id)).get();
    if (!item || item.type !== "markdown") {
      throw new Error(`Item "${id}" is not Markdown.`);
    }

    const previousMarkdown = readMarkdown(item.data);
    if (previousMarkdown === markdown) return false;

    const nextCount = countMarkdownWords(markdown);
    const previousCount = item.wordCount ?? countMarkdownWords(previousMarkdown);
    const delta = nextCount - previousCount;
    const now = Date.now();
    const day = localDayKey(new Date(now));
    const goalIds = item.folderId ? ancestorGoalIds(item.folderId) : [];
    /** Today rows are written for every ancestor even before a goal exists, so words written earlier the same day count when a goal is set mid-day. */
    const folderIds = item.folderId ? ancestorFolderIds(item.folderId) : [];

    tx.update(items)
      .set({
        data: withMarkdown(item.data, markdown),
        wordCount: nextCount,
        updatedAt: now,
      })
      .where(eq(items.id, id))
      .run();

    if (mode === "import") {
      for (const goalId of goalIds) setBaseline(goalId, id, nextCount);
      return true;
    }

    if (mode === "neutral") {
      if (delta !== 0) {
        shiftBaselines(id, delta);
        shiftTodayRows(id, day, delta, now);
      }
      return true;
    }

    for (const goalId of goalIds) ensureBaseline(goalId, id, previousCount);
    for (const folderId of folderIds) {
      upsertTodayRow(tx, {
        itemId: id,
        folderId,
        workspaceId: item.workspaceId,
        day,
        previousCount,
        nextCount,
        now,
      });
    }
    return true;
  });
}

export function setFolderWordGoal(folderId: string, targetWords: number): FolderWordGoalStats {
  if (!Number.isInteger(targetWords) || targetWords < 1 || targetWords > MAX_WORD_GOAL_TARGET) {
    throw new Error(
      `Word goal target must be an integer from 1 to ${MAX_WORD_GOAL_TARGET.toLocaleString("en-US")}.`,
    );
  }
  const db = getAppDatabase();
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get();
  if (!folder) throw new Error(`Folder "${folderId}" does not exist.`);

  const existing = db
    .select()
    .from(folderWordGoals)
    .where(eq(folderWordGoals.folderId, folderId))
    .get();
  if (existing) {
    db.update(folderWordGoals)
      .set({ targetWords, updatedAt: Date.now() })
      .where(eq(folderWordGoals.folderId, folderId))
      .run();
    const stats = getFolderWordGoalStats(folderId);
    if (!stats) throw new Error(`Folder "${folderId}" has no word goal.`);
    return stats;
  }

  const now = Date.now();
  const startDay = localDayKey(new Date(now));
  const sqlite = db.$client;
  db.transaction((tx) => {
    tx.insert(folderWordGoals)
      .values({
        folderId,
        workspaceId: folder.workspaceId,
        targetWords,
        startedAt: now,
        startDay,
        baselineWords: subtreeWordTotal(sqlite, folderId),
      })
      .run();
    sqlite
      .prepare(
        `WITH RECURSIVE subtree(id) AS (
          SELECT ?
          UNION ALL
          SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
        )
        INSERT INTO folder_goal_baselines (folder_id, item_id, baseline_words)
        SELECT ?, i.id, i.word_count
        FROM items i
        WHERE i.type = 'markdown'
          AND i.word_count IS NOT NULL
          AND i.folder_id IN (SELECT id FROM subtree)
        ON CONFLICT(folder_id, item_id) DO UPDATE SET baseline_words = excluded.baseline_words`,
      )
      .run(folderId, folderId);
  });
  scheduleWordCountBackfill();
  const stats = getFolderWordGoalStats(folderId);
  if (!stats) throw new Error(`Folder "${folderId}" has no word goal.`);
  return stats;
}

export function clearFolderWordGoal(folderId: string): void {
  const db = getAppDatabase();
  db.transaction((tx) => {
    tx.delete(folderWordGoals).where(eq(folderWordGoals.folderId, folderId)).run();
    db.$client.prepare("DELETE FROM folder_goal_baselines WHERE folder_id = ?").run(folderId);
  });
}

export function getFolderWordGoalStats(folderId: string): FolderWordGoalStats | null {
  const db = getAppDatabase();
  const goal = db
    .select()
    .from(folderWordGoals)
    .where(eq(folderWordGoals.folderId, folderId))
    .get();
  if (!goal) return null;
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get();
  if (!folder) return null;
  const today = localDayKey(new Date());
  const sinceStart = Math.max(0, sumSinceStart(folderId));
  return {
    folderId,
    folderName: folder.name,
    targetWords: goal.targetWords,
    startedAt: goal.startedAt,
    baselineWords: goal.baselineWords,
    sinceStart,
    today: Math.max(0, sumToday(folderId, today)),
    met: sinceStart >= goal.targetWords,
  };
}

export function getNearestWordGoalForItem(itemId: string): FolderWordGoalStats | null {
  const db = getAppDatabase();
  const item = db
    .select({ folderId: items.folderId, type: items.type })
    .from(items)
    .where(eq(items.id, itemId))
    .get();
  if (!item || item.type !== "markdown" || !item.folderId) return null;
  const nearest = db.$client
    .prepare(
      `WITH RECURSIVE chain(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id, f.parent_id, chain.depth + 1
        FROM folders f JOIN chain ON f.id = chain.parent_id
      )
      SELECT g.folder_id AS folderId
      FROM chain c
      JOIN folder_word_goals g ON g.folder_id = c.id
      ORDER BY c.depth ASC
      LIMIT 1`,
    )
    .get(item.folderId) as { folderId: string } | undefined;
  if (!nearest) return null;
  return getFolderWordGoalStats(nearest.folderId);
}

export function listFolderWordGoalIds(workspaceId: string): string[] {
  return getAppDatabase()
    .select({ folderId: folderWordGoals.folderId })
    .from(folderWordGoals)
    .where(eq(folderWordGoals.workspaceId, workspaceId))
    .all()
    .map((row) => row.folderId);
}

export function noteMovedBetweenFolders(
  itemId: string,
  wordCount: number | null,
  previousFolderId: string | null,
  nextFolderId: string | null,
): void {
  if (previousFolderId === nextFolderId) return;
  const previous = new Set(previousFolderId ? ancestorGoalIds(previousFolderId) : []);
  const next = new Set(nextFolderId ? ancestorGoalIds(nextFolderId) : []);
  const sqlite = getAppDatabase().$client;
  for (const goalId of previous) {
    if (next.has(goalId)) continue;
    sqlite
      .prepare("DELETE FROM folder_goal_baselines WHERE folder_id = ? AND item_id = ?")
      .run(goalId, itemId);
  }
  if (wordCount === null) return;
  for (const goalId of next) {
    if (previous.has(goalId)) continue;
    setBaseline(goalId, itemId, wordCount);
  }
}

export function assignGoalBaselinesForNewNote(itemId: string, folderId: string | null): void {
  if (!folderId) return;
  for (const goalId of ancestorGoalIds(folderId)) setBaseline(goalId, itemId, 0);
}

export function folderMovedToParent(
  movedFolderId: string,
  previousParentId: string | null,
  nextParentId: string | null,
): void {
  if (previousParentId === nextParentId) return;
  const previous = new Set(previousParentId ? ancestorGoalIds(previousParentId) : []);
  const next = new Set(nextParentId ? ancestorGoalIds(nextParentId) : []);
  const sqlite = getAppDatabase().$client;
  for (const goalId of previous) {
    if (next.has(goalId)) continue;
    deleteSubtreeBaselines(sqlite, movedFolderId, goalId);
  }
  for (const goalId of next) {
    if (previous.has(goalId)) continue;
    insertSubtreeBaselines(sqlite, movedFolderId, goalId);
  }
}

export function backfillWordCounts(limit: number): number {
  try {
    const db = getAppDatabase();
    const rows = db
      .select({ id: items.id, data: items.data, folderId: items.folderId })
      .from(items)
      .where(and(eq(items.type, "markdown"), isNull(items.wordCount)))
      .limit(limit)
      .all();
    for (const row of rows) {
      const count = countMarkdownWords(readMarkdown(row.data));
      db.update(items).set({ wordCount: count }).where(eq(items.id, row.id)).run();
      if (!row.folderId) continue;
      for (const goalId of ancestorGoalIds(row.folderId)) ensureBaseline(goalId, row.id, count);
    }
    return rows.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such column") || message.includes("no such table")) return 0;
    throw error;
  }
}

export function scheduleWordCountBackfill(): void {
  const step = () => {
    try {
      if (backfillWordCounts(BACKFILL_CHUNK) === BACKFILL_CHUNK) setImmediate(step);
    } catch (error) {
      console.error("[word-count] Backfill failed.", error);
    }
  };
  setImmediate(step);
}

function upsertTodayRow(
  tx: WordCountDb,
  input: {
    itemId: string;
    folderId: string;
    workspaceId: string;
    day: string;
    previousCount: number;
    nextCount: number;
    now: number;
  },
): void {
  const delta = input.nextCount - input.previousCount;
  const row = tx
    .select({ endWords: noteWordDays.endWords })
    .from(noteWordDays)
    .where(
      and(
        eq(noteWordDays.itemId, input.itemId),
        eq(noteWordDays.day, input.day),
        eq(noteWordDays.folderId, input.folderId),
      ),
    )
    .get();
  if (!row) {
    tx.insert(noteWordDays)
      .values({
        itemId: input.itemId,
        folderId: input.folderId,
        workspaceId: input.workspaceId,
        day: input.day,
        startWords: input.previousCount,
        endWords: input.nextCount,
        updatedAt: input.now,
      })
      .run();
    return;
  }
  tx.update(noteWordDays)
    .set({ endWords: row.endWords + delta, updatedAt: input.now })
    .where(
      and(
        eq(noteWordDays.itemId, input.itemId),
        eq(noteWordDays.day, input.day),
        eq(noteWordDays.folderId, input.folderId),
      ),
    )
    .run();
}

function setBaseline(goalId: string, itemId: string, baselineWords: number): void {
  getAppDatabase()
    .$client.prepare(
      `INSERT INTO folder_goal_baselines (folder_id, item_id, baseline_words)
       VALUES (?, ?, ?)
       ON CONFLICT(folder_id, item_id) DO UPDATE SET baseline_words = excluded.baseline_words`,
    )
    .run(goalId, itemId, baselineWords);
}

function ensureBaseline(goalId: string, itemId: string, baselineWords: number): void {
  getAppDatabase()
    .$client.prepare(
      `INSERT INTO folder_goal_baselines (folder_id, item_id, baseline_words)
       VALUES (?, ?, ?)
       ON CONFLICT(folder_id, item_id) DO NOTHING`,
    )
    .run(goalId, itemId, baselineWords);
}

function shiftBaselines(itemId: string, delta: number): void {
  getAppDatabase()
    .$client.prepare(
      "UPDATE folder_goal_baselines SET baseline_words = baseline_words + ? WHERE item_id = ?",
    )
    .run(delta, itemId);
}

function shiftTodayRows(itemId: string, day: string, delta: number, now: number): void {
  getAppDatabase()
    .$client.prepare(
      `UPDATE note_word_days
       SET start_words = start_words + ?, end_words = end_words + ?, updated_at = ?
       WHERE item_id = ? AND day = ?`,
    )
    .run(delta, delta, now, itemId, day);
}

function sumSinceStart(goalFolderId: string): number {
  const row = getAppDatabase()
    .$client.prepare(
      `SELECT coalesce(sum(i.word_count - b.baseline_words), 0) AS total
       FROM folder_goal_baselines b
       JOIN items i ON i.id = b.item_id
       WHERE b.folder_id = ? AND i.type = 'markdown'`,
    )
    .get(goalFolderId) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

function sumToday(goalFolderId: string, day: string): number {
  const row = getAppDatabase()
    .$client.prepare(
      `SELECT coalesce(sum(end_words - start_words), 0) AS total
       FROM note_word_days
       WHERE folder_id = ? AND day = ?`,
    )
    .get(goalFolderId, day) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

function ancestorFolderIds(folderId: string): string[] {
  const rows = getAppDatabase()
    .$client.prepare(
      `WITH RECURSIVE chain(id, parent_id) AS (
        SELECT id, parent_id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id, f.parent_id FROM folders f JOIN chain c ON f.id = c.parent_id
      )
      SELECT id AS folderId FROM chain`,
    )
    .all(folderId) as Array<{ folderId: string }>;
  return rows.map((row) => row.folderId);
}

function ancestorGoalIds(folderId: string): string[] {
  const rows = getAppDatabase()
    .$client.prepare(
      `WITH RECURSIVE chain(id, parent_id) AS (
        SELECT id, parent_id FROM folders WHERE id = ?
        UNION ALL
        SELECT f.id, f.parent_id FROM folders f JOIN chain c ON f.id = c.parent_id
      )
      SELECT g.folder_id AS folderId
      FROM chain c
      JOIN folder_word_goals g ON g.folder_id = c.id`,
    )
    .all(folderId) as Array<{ folderId: string }>;
  return rows.map((row) => row.folderId);
}

function subtreeWordTotal(sqlite: DatabaseSync, folderId: string): number {
  const row = sqlite
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
        SELECT ?
        UNION ALL
        SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
      )
      SELECT coalesce(sum(i.word_count), 0) AS total
      FROM items i
      WHERE i.type = 'markdown' AND i.folder_id IN (SELECT id FROM subtree)`,
    )
    .get(folderId) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

function deleteSubtreeBaselines(sqlite: DatabaseSync, movedFolderId: string, goalId: string): void {
  sqlite
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
        SELECT ?
        UNION ALL
        SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
      )
      DELETE FROM folder_goal_baselines
      WHERE folder_id = ?
        AND item_id IN (
          SELECT i.id FROM items i
          WHERE i.type = 'markdown' AND i.folder_id IN (SELECT id FROM subtree)
        )`,
    )
    .run(movedFolderId, goalId);
}

function insertSubtreeBaselines(sqlite: DatabaseSync, movedFolderId: string, goalId: string): void {
  sqlite
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
        SELECT ?
        UNION ALL
        SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
      )
      INSERT INTO folder_goal_baselines (folder_id, item_id, baseline_words)
      SELECT ?, i.id, i.word_count
      FROM items i
      WHERE i.type = 'markdown'
        AND i.word_count IS NOT NULL
        AND i.folder_id IN (SELECT id FROM subtree)
      ON CONFLICT(folder_id, item_id) DO UPDATE SET baseline_words = excluded.baseline_words`,
    )
    .run(movedFolderId, goalId);
}

function withMarkdown(data: unknown, markdown: string): { markdown: string } {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...data, markdown };
  }
  return { markdown };
}

function readMarkdown(data: unknown): string {
  if (!data || typeof data !== "object" || !("markdown" in data)) return "";
  const markdown = data.markdown;
  return typeof markdown === "string" ? markdown : "";
}
