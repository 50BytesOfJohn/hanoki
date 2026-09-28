import { and, asc, eq, isNull } from "drizzle-orm";

import type { MarkdownTitleOption, NoteBacklink } from "@shared/ipc";
import {
  findWikilinks,
  normalizeWikilinkTitle,
  oldestByItemId,
  rewriteWikilinkTargets,
  wikilinkSnippet,
} from "@shared/markdown/wikilink";

import { getAppDatabase } from "../db/database";
import { folders, items, noteLinks } from "../db/schema";

const BACKLINK_LIMIT = 50;

interface MarkdownTitleRow {
  id: string;
  title: string;
  createdAt: number;
}

export function reindexNoteLinks(itemId: string): void {
  const db = getAppDatabase();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.type !== "markdown") return;

  const titles = loadMarkdownTitles(item.workspaceId);
  const edges = uniqueEdges(readMarkdown(item.data), titles);
  db.transaction((tx) => {
    tx.delete(noteLinks).where(eq(noteLinks.fromItemId, itemId)).run();
    if (edges.length === 0) return;
    tx.insert(noteLinks)
      .values(
        edges.map((edge) => ({
          workspaceId: item.workspaceId,
          fromItemId: itemId,
          toItemId: edge.toItemId,
          targetText: edge.targetText,
          alias: edge.alias,
        })),
      )
      .run();
  });
}

export function rebuildWorkspaceNoteLinks(workspaceId: string): void {
  const db = getAppDatabase();
  const notes = db
    .select()
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), eq(items.type, "markdown")))
    .all();
  const titles = notes.map((note) => ({
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
  }));

  db.transaction((tx) => {
    tx.delete(noteLinks).where(eq(noteLinks.workspaceId, workspaceId)).run();
    const rows = notes.flatMap((note) =>
      uniqueEdges(readMarkdown(note.data), titles).map((edge) => ({
        workspaceId,
        fromItemId: note.id,
        toItemId: edge.toItemId,
        targetText: edge.targetText,
        alias: edge.alias,
      })),
    );
    if (rows.length === 0) return;
    tx.insert(noteLinks).values(rows).run();
  });
}

/** Rewrites bodies only for edges that already resolved to this item id, then reindexes those notes. */
export function rewriteNoteLinkTargets(
  itemId: string,
  previousTitle: string,
  nextTitle: string,
): string[] {
  if (previousTitle === nextTitle) return [];
  const db = getAppDatabase();
  const inbound = db
    .select({ fromItemId: noteLinks.fromItemId })
    .from(noteLinks)
    .where(eq(noteLinks.toItemId, itemId))
    .all();
  const fromIds = [...new Set(inbound.map((row) => row.fromItemId))];
  const rewritten: string[] = [];

  for (const fromId of fromIds) {
    const source = db.select().from(items).where(eq(items.id, fromId)).get();
    if (!source || source.type !== "markdown") continue;
    const current = readMarkdown(source.data);
    const next = rewriteWikilinkTargets(current, previousTitle, nextTitle);
    if (next === current) continue;
    db.update(items)
      .set({ data: { ...source.data, markdown: next }, updatedAt: Date.now() })
      .where(eq(items.id, fromId))
      .run();
    reindexNoteLinks(fromId);
    rewritten.push(fromId);
  }

  return rewritten;
}

export function resolveOpenNoteLinks(workspaceId: string): void {
  const db = getAppDatabase();
  const open = db
    .select()
    .from(noteLinks)
    .where(and(eq(noteLinks.workspaceId, workspaceId), isNull(noteLinks.toItemId)))
    .all();
  if (open.length === 0) return;

  const titles = loadMarkdownTitles(workspaceId);
  for (const row of open) {
    const toItemId = resolveTitle(titles, row.targetText);
    if (!toItemId) continue;
    db.update(noteLinks)
      .set({ toItemId })
      .where(
        and(
          eq(noteLinks.fromItemId, row.fromItemId),
          eq(noteLinks.targetText, row.targetText),
          eq(noteLinks.alias, row.alias),
        ),
      )
      .run();
  }
}

export function listMarkdownTitleOptions(workspaceId: string): MarkdownTitleOption[] {
  const db = getAppDatabase();
  const notes = db
    .select({
      id: items.id,
      title: items.title,
      folderId: items.folderId,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), eq(items.type, "markdown")))
    .orderBy(asc(items.title), asc(items.id))
    .all();
  const folderRows = db
    .select({ id: folders.id, parentId: folders.parentId, name: folders.name })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId))
    .all();
  const folderById = new Map(folderRows.map((folder) => [folder.id, folder]));

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    folderPath: folderPath(note.folderId, folderById),
    createdAt: note.createdAt,
  }));
}

export function listNoteBacklinks(itemId: string): NoteBacklink[] {
  const db = getAppDatabase();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.type !== "markdown") return [];

  const edges = db
    .select({ fromItemId: noteLinks.fromItemId, targetText: noteLinks.targetText })
    .from(noteLinks)
    .where(and(eq(noteLinks.workspaceId, item.workspaceId), eq(noteLinks.toItemId, itemId)))
    .all();
  const seen = new Set<string>();
  const backlinks: NoteBacklink[] = [];

  for (const edge of edges) {
    if (seen.has(edge.fromItemId) || backlinks.length >= BACKLINK_LIMIT) continue;
    seen.add(edge.fromItemId);
    const source = db.select().from(items).where(eq(items.id, edge.fromItemId)).get();
    if (!source || source.type !== "markdown") continue;
    backlinks.push({
      itemId: source.id,
      title: source.title,
      snippet: wikilinkSnippet(readMarkdown(source.data), edge.targetText),
    });
  }

  backlinks.sort(
    (left, right) =>
      left.title.localeCompare(right.title) || left.itemId.localeCompare(right.itemId),
  );
  return backlinks;
}

function uniqueEdges(markdown: string, titles: readonly MarkdownTitleRow[]) {
  const edges = new Map<string, { targetText: string; alias: string; toItemId: string | null }>();
  for (const link of findWikilinks(markdown)) {
    const targetText = link.target.trim();
    const alias = link.alias?.trim() ?? "";
    const key = `${targetText}\0${alias}`;
    if (edges.has(key)) continue;
    edges.set(key, {
      targetText,
      alias,
      toItemId: resolveTitle(titles, targetText),
    });
  }
  return [...edges.values()];
}

function resolveTitle(titles: readonly MarkdownTitleRow[], target: string): string | null {
  const key = normalizeWikilinkTitle(target);
  if (key.length === 0) return null;
  return (
    oldestByItemId(titles.filter((title) => normalizeWikilinkTitle(title.title) === key))?.id ??
    null
  );
}

function loadMarkdownTitles(workspaceId: string): MarkdownTitleRow[] {
  return getAppDatabase()
    .select({ id: items.id, title: items.title, createdAt: items.createdAt })
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), eq(items.type, "markdown")))
    .all();
}

function readMarkdown(data: unknown): string {
  if (!data || typeof data !== "object" || !("markdown" in data)) return "";
  const markdown = data.markdown;
  return typeof markdown === "string" ? markdown : "";
}

function folderPath(
  folderId: string | null,
  folderById: ReadonlyMap<string, { parentId: string | null; name: string }>,
): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current && !seen.has(current) && names.length < 20) {
    seen.add(current);
    const folder = folderById.get(current);
    if (!folder) break;
    names.push(folder.name);
    current = folder.parentId;
  }
  return names.reverse().join(" / ");
}
