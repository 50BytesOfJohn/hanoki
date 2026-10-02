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

interface ResolveNote {
  id: string;
  title: string;
  createdAt: number;
  folderId: string | null;
  importRelativePath: string | null;
  wrapId: string | null;
  folderTitlePath: string | null;
}

interface FolderRecord {
  id: string;
  parentId: string | null;
  name: string;
}

interface ResolveIndex {
  notes: readonly ResolveNote[];
  wrapByFolderId: ReadonlyMap<string, string>;
}

const IMPORTED_PARENT_NAME = "imported";

export function reindexNoteLinks(itemId: string): void {
  const db = getAppDatabase();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.type !== "markdown") return;

  const index = loadResolveIndex(item.workspaceId);
  const edges = uniqueEdges(readMarkdown(item.data), index, item.folderId);
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
  const index = buildResolveIndex(
    notes.map((note) => ({
      id: note.id,
      title: note.title,
      createdAt: note.createdAt,
      folderId: note.folderId,
      importRelativePath: note.importRelativePath,
    })),
    loadFolders(workspaceId),
  );

  db.transaction((tx) => {
    tx.delete(noteLinks).where(eq(noteLinks.workspaceId, workspaceId)).run();
    const rows = notes.flatMap((note) =>
      uniqueEdges(readMarkdown(note.data), index, note.folderId).map((edge) => ({
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

  const index = loadResolveIndex(workspaceId);
  const folderByNoteId = new Map(index.notes.map((note) => [note.id, note.folderId]));
  for (const row of open) {
    const toItemId = resolveTarget(
      index,
      folderByNoteId.get(row.fromItemId) ?? null,
      row.targetText,
    );
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

function uniqueEdges(markdown: string, index: ResolveIndex, sourceFolderId: string | null) {
  const edges = new Map<string, { targetText: string; alias: string; toItemId: string | null }>();
  for (const link of findWikilinks(markdown)) {
    const targetText = link.target.trim();
    const alias = link.alias?.trim() ?? "";
    const key = `${targetText}\0${alias}`;
    if (edges.has(key)) continue;
    edges.set(key, {
      targetText,
      alias,
      toItemId: resolveTarget(index, sourceFolderId, targetText),
    });
  }
  return [...edges.values()];
}

/** Strip `#heading` / `#^block` for lookup. Bodies stay untouched. */
function wikilinkLookupKey(target: string): string {
  const hash = target.indexOf("#");
  return (hash === -1 ? target : target.slice(0, hash)).trim();
}

function resolveTarget(
  index: ResolveIndex,
  sourceFolderId: string | null,
  target: string,
): string | null {
  const lookup = wikilinkLookupKey(target);
  const titleKey = normalizeWikilinkTitle(lookup);
  if (titleKey.length === 0) return null;

  const pathKey = lookup.includes("/") ? lookup.replace(/\.md$/i, "") : null;
  if (pathKey && sourceFolderId) {
    const wrapId = index.wrapByFolderId.get(sourceFolderId) ?? null;
    if (wrapId) {
      const wanted = normalizeWikilinkTitle(pathKey);
      const scoped = index.notes.filter((note) => note.wrapId === wrapId);
      const byPath = scoped.filter((note) => {
        if (!note.importRelativePath) return false;
        return normalizeWikilinkTitle(note.importRelativePath.replace(/\.md$/i, "")) === wanted;
      });
      const pathHit = oldestByItemId(byPath);
      if (pathHit) return pathHit.id;

      const byFolder = scoped.filter(
        (note) =>
          note.folderTitlePath !== null && normalizeWikilinkTitle(note.folderTitlePath) === wanted,
      );
      const folderHit = oldestByItemId(byFolder);
      if (folderHit) return folderHit.id;
    }
  }

  return (
    oldestByItemId(index.notes.filter((note) => normalizeWikilinkTitle(note.title) === titleKey))
      ?.id ?? null
  );
}

function wrapRootId(
  folderId: string | null,
  folderById: ReadonlyMap<string, FolderRecord>,
): string | null {
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = folderById.get(current);
    if (!folder?.parentId) return null;
    const parent = folderById.get(folder.parentId);
    if (!parent) return null;
    if (parent.parentId === null && parent.name.toLowerCase() === IMPORTED_PARENT_NAME) {
      return current;
    }
    current = folder.parentId;
  }
  return null;
}

function folderTitlePath(
  folderId: string | null,
  title: string,
  wrapId: string,
  folderById: ReadonlyMap<string, FolderRecord>,
): string | null {
  const names: string[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && current !== wrapId && !seen.has(current) && names.length < 40) {
    seen.add(current);
    const folder = folderById.get(current);
    if (!folder) return null;
    names.push(folder.name);
    current = folder.parentId;
  }
  if (current !== wrapId) return null;
  names.reverse();
  return names.length > 0 ? `${names.join("/")}/${title}` : title;
}

function loadResolveIndex(workspaceId: string): ResolveIndex {
  const noteRows = getAppDatabase()
    .select({
      id: items.id,
      title: items.title,
      createdAt: items.createdAt,
      folderId: items.folderId,
      importRelativePath: items.importRelativePath,
    })
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), eq(items.type, "markdown")))
    .all();
  return buildResolveIndex(noteRows, loadFolders(workspaceId));
}

function loadFolders(workspaceId: string): FolderRecord[] {
  return getAppDatabase()
    .select({ id: folders.id, parentId: folders.parentId, name: folders.name })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId))
    .all();
}

function buildResolveIndex(
  notes: readonly Omit<ResolveNote, "wrapId" | "folderTitlePath">[],
  folderRows: readonly FolderRecord[],
): ResolveIndex {
  const folderById = new Map(folderRows.map((folder) => [folder.id, folder]));
  const wrapByFolderId = new Map<string, string>();
  const indexed = notes.map((note) => {
    const wrapId = wrapRootId(note.folderId, folderById);
    if (note.folderId && wrapId) wrapByFolderId.set(note.folderId, wrapId);
    return {
      ...note,
      wrapId,
      folderTitlePath:
        wrapId === null ? null : folderTitlePath(note.folderId, note.title, wrapId, folderById),
    };
  });
  return { notes: indexed, wrapByFolderId };
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
