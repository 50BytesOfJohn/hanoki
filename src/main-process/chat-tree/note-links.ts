import { and, asc, eq, isNull } from "drizzle-orm";

import type { MarkdownTitleOption, NoteBacklink } from "@shared/ipc";
import {
  findWikilinks,
  normalizeWikilinkTitle,
  oldestByItemId,
  rewriteWikilinkTargets,
  splitWikilinkFragment,
  wikilinkSnippet,
} from "@shared/markdown/wikilink";

import { getAppDatabase } from "../db/database";
import { folders, items, noteLinks } from "../db/schema";

const BACKLINK_LIMIT = 50;
/** workspace_id, from_item_id, to_item_id, target_text, alias. */
const NOTE_LINK_BOUND_COLUMNS = 5;
const SQLITE_VARIABLE_LIMIT_FALLBACK = 999;

let cachedSqliteVariableLimit: number | null = null;

interface ResolveNote {
  id: string;
  title: string;
  createdAt: number;
  folderId: string | null;
  importRelativePath: string | null;
  importRootId: string | null;
  folderTitlePath: string | null;
}

interface FolderRecord {
  id: string;
  parentId: string | null;
  name: string;
}

interface ResolveIndex {
  notes: readonly ResolveNote[];
}

export function reindexNoteLinks(itemId: string): void {
  const db = getAppDatabase();
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.type !== "markdown") return;

  const index = loadResolveIndex(item.workspaceId);
  const edges = uniqueEdges(readMarkdown(item.data), index, item.importRootId);
  const rows = edges.map((edge) => ({
    workspaceId: item.workspaceId,
    fromItemId: itemId,
    toItemId: edge.toItemId,
    targetText: edge.targetText,
    alias: edge.alias,
  }));
  const chunkSize = noteLinkChunkSize();
  db.transaction((tx) => {
    tx.delete(noteLinks).where(eq(noteLinks.fromItemId, itemId)).run();
    insertNoteLinkRows(
      chunkSize,
      (chunk) => {
        tx.insert(noteLinks).values(chunk).run();
      },
      rows,
    );
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
      importRootId: note.importRootId,
    })),
    loadFolders(workspaceId),
  );

  const rows = notes.flatMap((note) =>
    uniqueEdges(readMarkdown(note.data), index, note.importRootId).map((edge) => ({
      workspaceId,
      fromItemId: note.id,
      toItemId: edge.toItemId,
      targetText: edge.targetText,
      alias: edge.alias,
    })),
  );
  const chunkSize = noteLinkChunkSize();
  db.transaction((tx) => {
    tx.delete(noteLinks).where(eq(noteLinks.workspaceId, workspaceId)).run();
    insertNoteLinkRows(
      chunkSize,
      (chunk) => {
        tx.insert(noteLinks).values(chunk).run();
      },
      rows,
    );
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
    .select({
      fromItemId: noteLinks.fromItemId,
      targetText: noteLinks.targetText,
      alias: noteLinks.alias,
    })
    .from(noteLinks)
    .where(eq(noteLinks.toItemId, itemId))
    .all();
  const edgesByFromId = new Map<string, { targetText: string; alias: string }[]>();
  for (const row of inbound) {
    const edges = edgesByFromId.get(row.fromItemId);
    const edge = { targetText: row.targetText, alias: row.alias };
    if (edges) edges.push(edge);
    else edgesByFromId.set(row.fromItemId, [edge]);
  }
  const rewritten: string[] = [];

  for (const [fromId, edges] of edgesByFromId) {
    const source = db.select().from(items).where(eq(items.id, fromId)).get();
    if (!source || source.type !== "markdown") continue;
    const current = readMarkdown(source.data);
    const next = rewriteWikilinkTargets(current, previousTitle, nextTitle, edges);
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
  const rootByNoteId = new Map(index.notes.map((note) => [note.id, note.importRootId]));
  for (const row of open) {
    const toItemId = resolveTarget(index, rootByNoteId.get(row.fromItemId) ?? null, row.targetText);
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

type NoteLinkInsertRow = {
  workspaceId: string;
  fromItemId: string;
  toItemId: string | null;
  targetText: string;
  alias: string;
};

function sqliteVariableLimit(): number {
  if (cachedSqliteVariableLimit !== null) return cachedSqliteVariableLimit;
  const sqlite = getAppDatabase().$client;
  const query = sqlite.prepare("SELECT sqlite_compileoption_get(?) AS opt");
  let limit = SQLITE_VARIABLE_LIMIT_FALLBACK;
  for (let index = 0; ; index += 1) {
    const row = query.get(index) as { opt: string | null } | undefined;
    if (!row?.opt) break;
    const match = /^MAX_VARIABLE_NUMBER=(\d+)$/.exec(row.opt);
    const parsed = match?.[1] ? Number(match[1]) : Number.NaN;
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      limit = parsed;
      break;
    }
  }
  cachedSqliteVariableLimit = limit;
  return limit;
}

function noteLinkChunkSize(): number {
  return Math.max(1, Math.floor(sqliteVariableLimit() / NOTE_LINK_BOUND_COLUMNS));
}

function insertNoteLinkRows(
  chunkSize: number,
  insertRows: (rows: NoteLinkInsertRow[]) => void,
  rows: readonly NoteLinkInsertRow[],
): void {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    insertRows(rows.slice(offset, offset + chunkSize));
  }
}

function uniqueEdges(markdown: string, index: ResolveIndex, sourceRootId: string | null) {
  const edges = new Map<string, { targetText: string; alias: string; toItemId: string | null }>();
  for (const link of findWikilinks(markdown)) {
    const targetText = link.target.trim();
    const alias = link.alias?.trim() ?? "";
    const key = `${targetText}\0${alias}`;
    if (edges.has(key)) continue;
    edges.set(key, {
      targetText,
      alias,
      toItemId: resolveTarget(index, sourceRootId, targetText),
    });
  }
  return [...edges.values()];
}

function resolveTarget(
  index: ResolveIndex,
  sourceRootId: string | null,
  target: string,
): string | null {
  const fullKey = normalizeWikilinkTitle(target.trim());
  if (fullKey.length === 0) return null;

  const lookup = splitWikilinkFragment(target).lookup;
  const strippedKey = normalizeWikilinkTitle(lookup);
  const pathKey = lookup.includes("/") ? lookup.replace(/\.md$/i, "") : null;

  if (pathKey && sourceRootId) {
    const wanted = normalizeWikilinkTitle(pathKey);
    const scoped = index.notes.filter((note) => note.importRootId === sourceRootId);
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

  const scopes: ReadonlyArray<readonly ResolveNote[]> = sourceRootId
    ? [
        index.notes.filter((note) => note.importRootId === sourceRootId),
        index.notes.filter((note) => note.importRootId === null),
      ]
    : [index.notes];
  for (const scope of scopes) {
    const exact = oldestTitled(scope, fullKey);
    if (exact) return exact;
    if (strippedKey !== fullKey) {
      const stripped = oldestTitled(scope, strippedKey);
      if (stripped) return stripped;
    }
  }
  return null;
}

function oldestTitled(notes: readonly ResolveNote[], titleKey: string): string | null {
  if (titleKey.length === 0) return null;
  return (
    oldestByItemId(notes.filter((note) => normalizeWikilinkTitle(note.title) === titleKey))?.id ??
    null
  );
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
      importRootId: items.importRootId,
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
  notes: readonly Omit<ResolveNote, "folderTitlePath">[],
  folderRows: readonly FolderRecord[],
): ResolveIndex {
  const folderById = new Map(folderRows.map((folder) => [folder.id, folder]));
  const indexed = notes.map((note) => ({
    ...note,
    folderTitlePath:
      note.importRootId === null
        ? null
        : folderTitlePath(note.folderId, note.title, note.importRootId, folderById),
  }));
  return { notes: indexed };
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
