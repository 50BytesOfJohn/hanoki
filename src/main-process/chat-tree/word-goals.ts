import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import type { FolderWordGoalStats } from "@shared/ipc";
import { localDayKey } from "@shared/markdown/day-key";
import { countMarkdownWords } from "@shared/markdown/word-count";

import { getAppDatabase, type AppDatabase } from "../db/database";
import { folderWordGoals, folders, items, noteWordDays } from "../db/schema";

export type WordCountMode = "edit" | "neutral" | "import";

const BACKFILL_CHUNK = 200;

type WordCountDb = Pick<AppDatabase, "insert" | "select" | "update" | "delete">;

export function writeMarkdownWordCount(id: string, markdown: string, mode: WordCountMode): void {
  const db = getAppDatabase();
  const item = db.select().from(items).where(eq(items.id, id)).get();
  if (!item || item.type !== "markdown") {
    throw new Error(`Item "${id}" is not Markdown.`);
  }

  const nextCount = countMarkdownWords(markdown);
  const previousMarkdown = readMarkdown(item.data);
  const previousCount = item.wordCount ?? countMarkdownWords(previousMarkdown);
  const now = Date.now();
  const day = localDayKey(new Date(now));

  db.transaction((tx) => {
    tx.update(items)
      .set({
        data: withMarkdown(item.data, markdown),
        wordCount: nextCount,
        updatedAt: now,
      })
      .where(eq(items.id, id))
      .run();

    if (mode === "import") return;
    if (mode === "neutral") {
      shiftTodayLedger(tx, id, day, nextCount - previousCount, now);
      return;
    }
    tx.insert(noteWordDays)
      .values({
        itemId: id,
        workspaceId: item.workspaceId,
        day,
        startWords: previousCount,
        endWords: nextCount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [noteWordDays.itemId, noteWordDays.day],
        set: { endWords: nextCount, updatedAt: now },
      })
      .run();
  });
}

export function setFolderWordGoal(folderId: string, targetWords: number): FolderWordGoalStats {
  if (!Number.isInteger(targetWords) || targetWords < 1) {
    throw new Error("Word goal target must be a positive integer.");
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

  const subtree = collectSubtreeIds(folder.workspaceId, folderId);
  backfillFolderWordCounts(subtree);
  const now = Date.now();
  const startDay = localDayKey(new Date(now));
  db.insert(folderWordGoals)
    .values({
      folderId,
      workspaceId: folder.workspaceId,
      targetWords,
      startedAt: now,
      startDay,
      baselineWords: sumWordCounts(subtree),
      preStartToday: rawDelta(subtree, startDay, startDay),
    })
    .run();
  const stats = getFolderWordGoalStats(folderId);
  if (!stats) throw new Error(`Folder "${folderId}" has no word goal.`);
  return stats;
}

export function clearFolderWordGoal(folderId: string): void {
  getAppDatabase().delete(folderWordGoals).where(eq(folderWordGoals.folderId, folderId)).run();
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
  const subtree = collectSubtreeIds(folder.workspaceId, folderId);
  const today = localDayKey(new Date());
  const sinceRaw = rawDelta(subtree, goal.startDay) - goal.preStartToday;
  const sinceStart = Math.max(0, sinceRaw);
  return {
    folderId,
    folderName: folder.name,
    targetWords: goal.targetWords,
    startedAt: goal.startedAt,
    baselineWords: goal.baselineWords,
    sinceStart,
    today: Math.max(0, rawDelta(subtree, today, today)),
    met: sinceStart >= goal.targetWords,
  };
}

export function getNearestWordGoalForItem(itemId: string): FolderWordGoalStats | null {
  const db = getAppDatabase();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.type !== "markdown" || !item.folderId) return null;

  let folderId: string | null = item.folderId;
  const seen = new Set<string>();
  while (folderId && !seen.has(folderId)) {
    seen.add(folderId);
    const stats = getFolderWordGoalStats(folderId);
    if (stats) return stats;
    const folder = db.select().from(folders).where(eq(folders.id, folderId)).get();
    folderId = folder?.parentId ?? null;
  }
  return null;
}

export function listFolderWordGoalIds(workspaceId: string): string[] {
  return getAppDatabase()
    .select({ folderId: folderWordGoals.folderId })
    .from(folderWordGoals)
    .where(eq(folderWordGoals.workspaceId, workspaceId))
    .all()
    .map((row) => row.folderId);
}

export function backfillWordCounts(limit: number): number {
  try {
    const db = getAppDatabase();
    const rows = db
      .select({ id: items.id, data: items.data })
      .from(items)
      .where(and(eq(items.type, "markdown"), isNull(items.wordCount)))
      .limit(limit)
      .all();
    for (const row of rows) {
      db.update(items)
        .set({ wordCount: countMarkdownWords(readMarkdown(row.data)) })
        .where(eq(items.id, row.id))
        .run();
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

function shiftTodayLedger(
  tx: WordCountDb,
  itemId: string,
  day: string,
  delta: number,
  now: number,
): void {
  if (delta === 0) return;
  const row = tx
    .select()
    .from(noteWordDays)
    .where(and(eq(noteWordDays.itemId, itemId), eq(noteWordDays.day, day)))
    .get();
  if (!row) return;
  tx.update(noteWordDays)
    .set({
      startWords: row.startWords + delta,
      endWords: row.endWords + delta,
      updatedAt: now,
    })
    .where(and(eq(noteWordDays.itemId, itemId), eq(noteWordDays.day, day)))
    .run();
}

function backfillFolderWordCounts(subtreeIds: readonly string[]): void {
  if (subtreeIds.length === 0) return;
  const db = getAppDatabase();
  const rows = db
    .select({ id: items.id, data: items.data })
    .from(items)
    .where(
      and(eq(items.type, "markdown"), inArray(items.folderId, subtreeIds), isNull(items.wordCount)),
    )
    .all();
  for (const row of rows) {
    db.update(items)
      .set({ wordCount: countMarkdownWords(readMarkdown(row.data)) })
      .where(eq(items.id, row.id))
      .run();
  }
}

function sumWordCounts(subtreeIds: readonly string[]): number {
  if (subtreeIds.length === 0) return 0;
  const row = getAppDatabase()
    .select({ total: sql<number>`coalesce(sum(${items.wordCount}), 0)` })
    .from(items)
    .where(and(eq(items.type, "markdown"), inArray(items.folderId, [...subtreeIds])))
    .get();
  return Number(row?.total ?? 0);
}

function rawDelta(subtreeIds: readonly string[], fromDay: string, toDay?: string): number {
  if (subtreeIds.length === 0) return 0;
  const row = getAppDatabase()
    .select({
      total: sql<number>`coalesce(sum(${noteWordDays.endWords} - ${noteWordDays.startWords}), 0)`,
    })
    .from(noteWordDays)
    .innerJoin(items, eq(items.id, noteWordDays.itemId))
    .where(
      and(
        eq(items.type, "markdown"),
        inArray(items.folderId, [...subtreeIds]),
        gte(noteWordDays.day, fromDay),
        toDay ? lte(noteWordDays.day, toDay) : undefined,
      ),
    )
    .get();
  return Number(row?.total ?? 0);
}

function collectSubtreeIds(workspaceId: string, rootFolderId: string): string[] {
  const all = getAppDatabase()
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId))
    .all();
  const children = new Map<string, string[]>();
  for (const folder of all) {
    if (!folder.parentId) continue;
    const list = children.get(folder.parentId);
    if (list) list.push(folder.id);
    else children.set(folder.parentId, [folder.id]);
  }
  const subtree: string[] = [];
  const stack = [rootFolderId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    subtree.push(current);
    const nested = children.get(current);
    if (!nested) continue;
    for (let index = nested.length - 1; index >= 0; index -= 1) {
      const child = nested[index];
      if (child) stack.push(child);
    }
  }
  return subtree;
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
