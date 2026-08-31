import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { homedir } from "node:os";

import type { ChatItemData, ChatSettings, MarkdownItemData, TerminalItemData } from "@shared/ipc";
import { isReasoningEffort, type ReasoningEffort } from "@shared/models/reasoning";
import { getAppDatabase } from "../db/database";
import { createUuidV7 } from "../db/uuidv7";
import { folders, items, messages } from "../db/schema";
import { getWorkspaceById } from "../workspaces/repository";
import { listAllMessagesByChatId, upsertMessage } from "../messages/repository";

type FolderTableRow = typeof folders.$inferSelect;
type ItemTableRow = typeof items.$inferSelect;
type ChatSettingsPatch = Omit<Partial<ChatSettings>, "modelConfig"> & {
  modelConfig?: {
    temperature?: number | null;
    reasoningEffort?: ReasoningEffort | null;
  };
};

export interface FolderRow {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatRow {
  type: "chat";
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  data: ChatItemData;
  metadata: Record<string, unknown>;
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TerminalRow {
  type: "terminal";
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  data: TerminalItemData;
  metadata: Record<string, unknown>;
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface MarkdownRow {
  type: "markdown";
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  data: MarkdownItemData;
  metadata: Record<string, unknown>;
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type ItemRow = ChatRow | TerminalRow | MarkdownRow;

export interface ChatTreeFolderNode {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
  folders: ChatTreeFolderNode[];
  items: ItemRow[];
}

export interface ChatTreeSnapshot {
  workspaceId: string;
  rootFolders: ChatTreeFolderNode[];
  rootItems: ItemRow[];
}

export interface ChatTreeFolderListItem extends FolderRow {
  childFolderCount: number;
  childItemCount: number;
}

export interface ChatTreeChildrenSlice {
  workspaceId: string;
  parentFolderId: string | null;
  folders: ChatTreeFolderListItem[];
  items: ItemRow[];
}

export interface DeleteFolderRecursiveResult {
  workspaceId: string;
  deletedFolderIds: string[];
}

export interface DeleteChatTreeItemsResult {
  workspaceId: string;
  deletedItemIds: string[];
  deletedFolderIds: string[];
}

export interface MoveChatTreeItemsResult {
  workspaceId: string;
  movedItems: { kind: "item" | "folder"; id: string }[];
  unchangedItems: { kind: "item" | "folder"; id: string }[];
  skippedItems: { kind: "item" | "folder"; id: string; reason: string }[];
}

function toFolderRow(row: FolderTableRow): FolderRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    parentId: row.parentId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeChatData(value: unknown): ChatItemData {
  const data = normalizeJsonObject(value);
  return {
    ...data,
    settings: normalizeChatSettings(data.settings),
    ...(typeof data.currentBranchId === "string" ? { currentBranchId: data.currentBranchId } : {}),
  };
}

function normalizeTerminalData(value: unknown): TerminalItemData {
  const data = normalizeJsonObject(value);
  const fallbackShell =
    process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh";
  return {
    ...data,
    workingDirectory: typeof data.workingDirectory === "string" ? data.workingDirectory : homedir(),
    shell: typeof data.shell === "string" ? data.shell : fallbackShell,
    columns:
      typeof data.columns === "number" && Number.isInteger(data.columns) && data.columns > 0
        ? data.columns
        : 80,
    rows:
      typeof data.rows === "number" && Number.isInteger(data.rows) && data.rows > 0
        ? data.rows
        : 24,
    scrollback: typeof data.scrollback === "string" ? data.scrollback : "",
    scrollbackVersion:
      typeof data.scrollbackVersion === "number" && Number.isInteger(data.scrollbackVersion)
        ? data.scrollbackVersion
        : 0,
  };
}

function normalizeMarkdownData(value: unknown): MarkdownItemData {
  const data = normalizeJsonObject(value);
  return {
    ...data,
    markdown: typeof data.markdown === "string" ? data.markdown : "",
  };
}

function toItemRow(row: ItemTableRow): ItemRow {
  const common = {
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    title: row.title,
    metadata: normalizeJsonObject(row.metadata),
    extensions: normalizeJsonObject(row.extensions),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (row.type === "chat") {
    return { ...common, type: "chat", data: normalizeChatData(row.data) };
  }
  if (row.type === "terminal") {
    return { ...common, type: "terminal", data: normalizeTerminalData(row.data) };
  }
  if (row.type === "markdown") {
    return { ...common, type: "markdown", data: normalizeMarkdownData(row.data) };
  }
  throw new Error(`Item "${row.id}" has unsupported type "${row.type}".`);
}

function toChatRow(row: ItemTableRow): ChatRow {
  const item = toItemRow(row);
  if (item.type !== "chat") {
    throw new Error(`Item "${row.id}" is not a chat.`);
  }
  return item;
}

function normalizeChatSettings(value: unknown): ChatSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const modelId = record.modelId;
  const systemPrompt = record.systemPrompt;
  const modelConfig = record.modelConfig;
  const webEnabled = record.webEnabled;
  const hanokiEnabled = record.hanokiEnabled;
  const normalizedSettings: ChatSettings = {};

  if (typeof modelId === "string") {
    normalizedSettings.modelId = modelId;
  } else if (modelId === null) {
    normalizedSettings.modelId = null;
  }

  if (typeof systemPrompt === "string") {
    normalizedSettings.systemPrompt = systemPrompt;
  } else if (systemPrompt === null) {
    normalizedSettings.systemPrompt = null;
  }

  if (modelConfig && typeof modelConfig === "object" && !Array.isArray(modelConfig)) {
    const temperature = (modelConfig as Record<string, unknown>).temperature;
    const reasoningEffort = (modelConfig as Record<string, unknown>).reasoningEffort;
    if (
      typeof temperature === "number" &&
      Number.isFinite(temperature) &&
      temperature >= 0 &&
      temperature <= 1
    ) {
      normalizedSettings.modelConfig = { temperature };
    }

    if (isReasoningEffort(reasoningEffort)) {
      normalizedSettings.modelConfig = { ...normalizedSettings.modelConfig, reasoningEffort };
    }
  }

  if (typeof webEnabled === "boolean") {
    normalizedSettings.webEnabled = webEnabled;
  }

  if (typeof hanokiEnabled === "boolean") {
    normalizedSettings.hanokiEnabled = hanokiEnabled;
  }

  if (typeof record.terminalEnabled === "boolean") {
    normalizedSettings.terminalEnabled = record.terminalEnabled;
  }

  if (typeof record.terminalAutoApprove === "boolean") {
    normalizedSettings.terminalAutoApprove = record.terminalAutoApprove;
  }

  return normalizedSettings;
}

function mergeChatSettings(value: unknown, settingsPatch?: ChatSettingsPatch): ChatSettings {
  const currentSettings = normalizeChatSettings(value);

  if (!settingsPatch) {
    return currentSettings;
  }

  const nextSettings: ChatSettings = { ...currentSettings };

  if ("modelId" in settingsPatch) {
    nextSettings.modelId = settingsPatch.modelId ?? null;
  }

  if ("systemPrompt" in settingsPatch) {
    nextSettings.systemPrompt = settingsPatch.systemPrompt ?? null;
  }

  if (settingsPatch.modelConfig) {
    const modelConfig = { ...nextSettings.modelConfig };
    if (settingsPatch.modelConfig.temperature === null) {
      delete modelConfig.temperature;
    } else if (settingsPatch.modelConfig.temperature !== undefined) {
      modelConfig.temperature = settingsPatch.modelConfig.temperature;
    }

    if (settingsPatch.modelConfig.reasoningEffort === null) {
      delete modelConfig.reasoningEffort;
    } else if (settingsPatch.modelConfig.reasoningEffort !== undefined) {
      modelConfig.reasoningEffort = settingsPatch.modelConfig.reasoningEffort;
    }

    if (Object.keys(modelConfig).length === 0) {
      delete nextSettings.modelConfig;
    } else {
      nextSettings.modelConfig = modelConfig;
    }
  }

  if ("webEnabled" in settingsPatch) {
    nextSettings.webEnabled = settingsPatch.webEnabled ?? false;
  }

  if ("hanokiEnabled" in settingsPatch) {
    nextSettings.hanokiEnabled = settingsPatch.hanokiEnabled ?? false;
  }

  if ("terminalEnabled" in settingsPatch) {
    nextSettings.terminalEnabled = settingsPatch.terminalEnabled ?? false;
  }

  if ("terminalAutoApprove" in settingsPatch) {
    nextSettings.terminalAutoApprove = settingsPatch.terminalAutoApprove ?? false;
  }

  return nextSettings;
}

function requireWorkspaceExists(workspaceId: string): void {
  if (!getWorkspaceById(workspaceId)) {
    throw new Error(`Workspace "${workspaceId}" does not exist.`);
  }
}

export function getFolderById(id: string): FolderRow | null {
  const row = getAppDatabase().select().from(folders).where(eq(folders.id, id)).get();
  return row ? toFolderRow(row) : null;
}

function requireFolderById(id: string): FolderRow {
  const folder = getFolderById(id);
  if (!folder) {
    throw new Error(`Folder "${id}" does not exist.`);
  }

  return folder;
}

export function getChatById(id: string): ChatRow | null {
  const row = getAppDatabase()
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.type, "chat")))
    .get();
  return row ? toChatRow(row) : null;
}

export function getItemById(id: string): ItemRow | null {
  const row = getAppDatabase().select().from(items).where(eq(items.id, id)).get();
  return row ? toItemRow(row) : null;
}

function requireChatById(id: string): ChatRow {
  const chat = getChatById(id);
  if (!chat) {
    throw new Error(`Chat "${id}" does not exist.`);
  }

  return chat;
}

function requireItemById(id: string): ItemRow {
  const item = getItemById(id);
  if (!item) throw new Error(`Item "${id}" does not exist.`);
  return item;
}

function wouldFolderParentCreateCycle(
  folderId: string,
  parentId: string,
  foldersById: ReadonlyMap<string, Pick<FolderTableRow, "id" | "parentId">>,
): boolean {
  let currentId: string | null = parentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === folderId) {
      return true;
    }

    if (visited.has(currentId)) {
      return true;
    }

    visited.add(currentId);

    const currentFolder = foldersById.get(currentId);
    if (!currentFolder) {
      return false;
    }

    currentId = currentFolder.parentId;
  }

  return false;
}

function collectFolderSubtreeIds(
  allWorkspaceFolders: readonly FolderTableRow[],
  rootFolderId: string,
): string[] {
  const childFolderIdsByParentId = new Map<string, string[]>();

  for (const folder of allWorkspaceFolders) {
    if (!folder.parentId) {
      continue;
    }

    const existing = childFolderIdsByParentId.get(folder.parentId);
    if (existing) {
      existing.push(folder.id);
    } else {
      childFolderIdsByParentId.set(folder.parentId, [folder.id]);
    }
  }

  const subtreeFolderIds: string[] = [];
  const stack = [rootFolderId];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const currentFolderId = stack.pop();
    if (!currentFolderId || seen.has(currentFolderId)) {
      continue;
    }

    seen.add(currentFolderId);
    subtreeFolderIds.push(currentFolderId);

    const children = childFolderIdsByParentId.get(currentFolderId);
    if (!children) {
      continue;
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return subtreeFolderIds;
}

function warnInvalidFolderParent(
  workspaceId: string,
  folderId: string,
  parentId: string,
  reason: string,
): void {
  console.warn(
    `[chat-tree] Folder "${folderId}" has invalid parent "${parentId}" in workspace "${workspaceId}" (${reason}); treating as root.`,
  );
}

function warnInvalidItemFolder(
  workspaceId: string,
  itemId: string,
  folderId: string,
  reason: string,
): void {
  console.warn(
    `[chat-tree] Item "${itemId}" has invalid folder "${folderId}" in workspace "${workspaceId}" (${reason}); treating as root.`,
  );
}

export function getChatTree(workspaceId: string): ChatTreeSnapshot {
  requireWorkspaceExists(workspaceId);

  const folderRows = getAppDatabase()
    .select()
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId))
    .orderBy(asc(folders.id))
    .all();

  const itemRows = getAppDatabase()
    .select()
    .from(items)
    .where(eq(items.workspaceId, workspaceId))
    .orderBy(asc(items.id))
    .all();

  const folderRowsById = new Map(folderRows.map((row) => [row.id, row] as const));
  const folderNodesById = new Map<string, ChatTreeFolderNode>();

  for (const row of folderRows) {
    folderNodesById.set(row.id, {
      ...toFolderRow(row),
      folders: [],
      items: [],
    });
  }

  const rootFolders: ChatTreeFolderNode[] = [];

  for (const row of folderRows) {
    const node = folderNodesById.get(row.id);
    if (!node) {
      continue;
    }

    if (!row.parentId) {
      rootFolders.push(node);
      continue;
    }

    if (row.parentId === row.id) {
      warnInvalidFolderParent(workspaceId, row.id, row.parentId, "self-parent");
      rootFolders.push(node);
      continue;
    }

    const parentRow = folderRowsById.get(row.parentId);
    if (!parentRow) {
      warnInvalidFolderParent(workspaceId, row.id, row.parentId, "missing parent");
      rootFolders.push(node);
      continue;
    }

    if (wouldFolderParentCreateCycle(row.id, row.parentId, folderRowsById)) {
      warnInvalidFolderParent(workspaceId, row.id, row.parentId, "cycle");
      rootFolders.push(node);
      continue;
    }

    const parentNode = folderNodesById.get(row.parentId);
    if (!parentNode) {
      warnInvalidFolderParent(workspaceId, row.id, row.parentId, "missing parent node");
      rootFolders.push(node);
      continue;
    }

    parentNode.folders.push(node);
  }

  const rootItems: ItemRow[] = [];

  for (const row of itemRows) {
    const item = toItemRow(row);

    if (!row.folderId) {
      rootItems.push(item);
      continue;
    }

    const folderNode = folderNodesById.get(row.folderId);
    if (!folderNode) {
      warnInvalidItemFolder(workspaceId, row.id, row.folderId, "missing folder");
      rootItems.push(item);
      continue;
    }

    folderNode.items.push(item);
  }

  return {
    workspaceId,
    rootFolders,
    rootItems,
  };
}

export function getChatTreeChildren(
  workspaceId: string,
  parentFolderId: string | null,
): ChatTreeChildrenSlice {
  requireWorkspaceExists(workspaceId);

  if (parentFolderId !== null) {
    const parentFolder = requireFolderById(parentFolderId);
    if (parentFolder.workspaceId !== workspaceId) {
      throw new Error(`Parent folder "${parentFolderId}" belongs to a different workspace.`);
    }
  }

  const folderRows =
    parentFolderId === null
      ? getAppDatabase()
          .select()
          .from(folders)
          .where(and(eq(folders.workspaceId, workspaceId), isNull(folders.parentId)))
          .orderBy(asc(folders.id))
          .all()
      : getAppDatabase()
          .select()
          .from(folders)
          .where(and(eq(folders.workspaceId, workspaceId), eq(folders.parentId, parentFolderId)))
          .orderBy(asc(folders.id))
          .all();

  const itemRows =
    parentFolderId === null
      ? getAppDatabase()
          .select()
          .from(items)
          .where(and(eq(items.workspaceId, workspaceId), isNull(items.folderId)))
          .orderBy(asc(items.id))
          .all()
      : getAppDatabase()
          .select()
          .from(items)
          .where(and(eq(items.workspaceId, workspaceId), eq(items.folderId, parentFolderId)))
          .orderBy(asc(items.id))
          .all();

  const childFolderIds = folderRows.map((row) => row.id);
  const childFolderCountsByParentId = new Map<string, number>();
  const childItemCountsByFolderId = new Map<string, number>();

  if (childFolderIds.length > 0) {
    const folderCountRows = getAppDatabase()
      .select({
        parentId: folders.parentId,
        count: sql<number>`count(*)`,
      })
      .from(folders)
      .where(inArray(folders.parentId, childFolderIds))
      .groupBy(folders.parentId)
      .all();

    for (const row of folderCountRows) {
      if (typeof row.parentId === "string") {
        childFolderCountsByParentId.set(row.parentId, Number(row.count) || 0);
      }
    }

    const itemCountRows = getAppDatabase()
      .select({
        folderId: items.folderId,
        count: sql<number>`count(*)`,
      })
      .from(items)
      .where(inArray(items.folderId, childFolderIds))
      .groupBy(items.folderId)
      .all();

    for (const row of itemCountRows) {
      if (typeof row.folderId === "string") {
        childItemCountsByFolderId.set(row.folderId, Number(row.count) || 0);
      }
    }
  }

  return {
    workspaceId,
    parentFolderId,
    folders: folderRows.map((row) => ({
      ...toFolderRow(row),
      childFolderCount: childFolderCountsByParentId.get(row.id) ?? 0,
      childItemCount: childItemCountsByFolderId.get(row.id) ?? 0,
    })),
    items: itemRows.map(toItemRow),
  };
}

export function listWorkspaceFolderIds(workspaceId: string, ids: readonly string[]): string[] {
  requireWorkspaceExists(workspaceId);

  if (ids.length === 0) {
    return [];
  }

  return getAppDatabase()
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceId), inArray(folders.id, [...ids])))
    .orderBy(asc(folders.id))
    .all()
    .map((row) => row.id);
}

export function listWorkspaceChatIds(workspaceId: string, ids: readonly string[]): string[] {
  requireWorkspaceExists(workspaceId);

  if (ids.length === 0) {
    return [];
  }

  return getAppDatabase()
    .select({ id: items.id })
    .from(items)
    .where(
      and(eq(items.workspaceId, workspaceId), eq(items.type, "chat"), inArray(items.id, [...ids])),
    )
    .orderBy(asc(items.id))
    .all()
    .map((row) => row.id);
}

export function listWorkspaceItemIds(workspaceId: string, ids: readonly string[]): string[] {
  requireWorkspaceExists(workspaceId);
  if (ids.length === 0) return [];
  return getAppDatabase()
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), inArray(items.id, [...ids])))
    .orderBy(asc(items.id))
    .all()
    .map((row) => row.id);
}

export function searchWorkspaceChats(
  workspaceId: string,
  query: string,
  limit: number,
  offset: number,
): ChatRow[] {
  requireWorkspaceExists(workspaceId);

  return getAppDatabase()
    .select()
    .from(items)
    .where(
      and(
        eq(items.workspaceId, workspaceId),
        eq(items.type, "chat"),
        sql`(
          instr(lower(${items.title}), lower(${query})) > 0
          or exists (
            select 1 from ${messages}
            where ${messages.chatId} = ${items.id}
              and instr(lower(cast(${messages.parts} as text)), lower(${query})) > 0
          )
        )`,
      ),
    )
    .orderBy(desc(items.updatedAt), asc(items.id))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toChatRow);
}

export function createFolder(input: {
  workspaceId: string;
  name: string;
  parentId: string | null;
}): FolderRow {
  requireWorkspaceExists(input.workspaceId);

  if (input.parentId !== null) {
    const parentFolder = requireFolderById(input.parentId);
    if (parentFolder.workspaceId !== input.workspaceId) {
      throw new Error(`Parent folder "${input.parentId}" belongs to a different workspace.`);
    }
  }

  const id = createUuidV7();

  getAppDatabase()
    .insert(folders)
    .values({
      id,
      workspaceId: input.workspaceId,
      parentId: input.parentId,
      name: input.name,
    })
    .run();

  return requireFolderById(id);
}

export function updateFolderName(id: string, name: string): FolderRow {
  getAppDatabase()
    .update(folders)
    .set({
      name,
      updatedAt: Date.now(),
    })
    .where(eq(folders.id, id))
    .run();

  return requireFolderById(id);
}

export function moveFolder(id: string, parentId: string | null): FolderRow {
  return getAppDatabase().transaction((tx) => {
    const folder = tx.select().from(folders).where(eq(folders.id, id)).get();
    if (!folder) {
      throw new Error(`Folder "${id}" does not exist.`);
    }

    if (parentId === folder.id) {
      throw new Error(`Folder "${id}" cannot be moved into itself.`);
    }

    if (parentId !== null) {
      const parentFolder = tx.select().from(folders).where(eq(folders.id, parentId)).get();
      if (!parentFolder) {
        throw new Error(`Parent folder "${parentId}" does not exist.`);
      }

      if (parentFolder.workspaceId !== folder.workspaceId) {
        throw new Error(`Parent folder "${parentId}" belongs to a different workspace.`);
      }

      const workspaceFolders = tx
        .select()
        .from(folders)
        .where(eq(folders.workspaceId, folder.workspaceId))
        .all();
      const workspaceFoldersById = new Map(workspaceFolders.map((row) => [row.id, row] as const));

      if (wouldFolderParentCreateCycle(folder.id, parentId, workspaceFoldersById)) {
        throw new Error(`Folder "${id}" cannot be moved into descendant folder "${parentId}".`);
      }
    }

    tx.update(folders)
      .set({
        parentId,
        updatedAt: Date.now(),
      })
      .where(eq(folders.id, id))
      .run();

    const updatedFolder = tx.select().from(folders).where(eq(folders.id, id)).get();
    if (!updatedFolder) {
      throw new Error(`Folder "${id}" does not exist.`);
    }

    return toFolderRow(updatedFolder);
  });
}

export function deleteFolderRecursive(id: string): DeleteFolderRecursiveResult {
  return getAppDatabase().transaction((tx) => {
    const folder = tx.select().from(folders).where(eq(folders.id, id)).get();
    if (!folder) {
      throw new Error(`Folder "${id}" does not exist.`);
    }

    const workspaceFolders = tx
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, folder.workspaceId))
      .all();
    const subtreeFolderIds = collectFolderSubtreeIds(workspaceFolders, id);

    if (subtreeFolderIds.length === 0) {
      return {
        workspaceId: folder.workspaceId,
        deletedFolderIds: [],
      };
    }

    tx.delete(items).where(inArray(items.folderId, subtreeFolderIds)).run();
    tx.delete(folders).where(inArray(folders.id, subtreeFolderIds)).run();

    return {
      workspaceId: folder.workspaceId,
      deletedFolderIds: subtreeFolderIds,
    };
  });
}

export function deleteChatTreeItems(
  workspaceId: string,
  itemRefs: readonly {
    kind: "item" | "folder";
    id: string;
  }[],
): DeleteChatTreeItemsResult {
  requireWorkspaceExists(workspaceId);

  if (itemRefs.length === 0) {
    return {
      workspaceId,
      deletedItemIds: [],
      deletedFolderIds: [],
    };
  }

  return getAppDatabase().transaction((tx) => {
    const selectedFolderIds = [
      ...new Set(itemRefs.filter((item) => item.kind === "folder").map((item) => item.id)),
    ];
    const selectedItemIds = [
      ...new Set(itemRefs.filter((item) => item.kind === "item").map((item) => item.id)),
    ];

    for (const folderId of selectedFolderIds) {
      const folder = tx.select().from(folders).where(eq(folders.id, folderId)).get();
      if (!folder) {
        throw new Error(`Folder "${folderId}" does not exist.`);
      }
      if (folder.workspaceId !== workspaceId) {
        throw new Error(`Folder "${folderId}" belongs to a different workspace.`);
      }
    }

    for (const itemId of selectedItemIds) {
      const item = tx.select().from(items).where(eq(items.id, itemId)).get();
      if (!item) {
        throw new Error(`Item "${itemId}" does not exist.`);
      }
      if (item.workspaceId !== workspaceId) {
        throw new Error(`Item "${itemId}" belongs to a different workspace.`);
      }
    }

    const workspaceFolders = tx
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .all();
    const workspaceItems = tx
      .select({ id: items.id, folderId: items.folderId })
      .from(items)
      .where(eq(items.workspaceId, workspaceId))
      .all();

    const deletedFolderIds = new Set<string>();

    for (const folderId of selectedFolderIds) {
      const subtreeFolderIds = collectFolderSubtreeIds(workspaceFolders, folderId);
      for (const subtreeFolderId of subtreeFolderIds) {
        deletedFolderIds.add(subtreeFolderId);
      }
    }

    const deletedItemIds = new Set(selectedItemIds);

    if (deletedFolderIds.size > 0) {
      for (const item of workspaceItems) {
        if (item.folderId && deletedFolderIds.has(item.folderId)) {
          deletedItemIds.add(item.id);
        }
      }
    }

    const sortedDeletedItemIds = [...deletedItemIds].sort((left, right) =>
      left.localeCompare(right),
    );
    const sortedDeletedFolderIds = [...deletedFolderIds].sort((left, right) =>
      left.localeCompare(right),
    );

    if (sortedDeletedItemIds.length > 0) {
      tx.delete(items).where(inArray(items.id, sortedDeletedItemIds)).run();
    }

    if (sortedDeletedFolderIds.length > 0) {
      tx.delete(folders).where(inArray(folders.id, sortedDeletedFolderIds)).run();
    }

    return {
      workspaceId,
      deletedItemIds: sortedDeletedItemIds,
      deletedFolderIds: sortedDeletedFolderIds,
    };
  });
}

export function moveChatTreeItems(
  workspaceId: string,
  itemRefs: readonly { kind: "item" | "folder"; id: string }[],
  destinationFolderId: string | null,
): MoveChatTreeItemsResult {
  requireWorkspaceExists(workspaceId);

  return getAppDatabase().transaction((tx) => {
    const workspaceFolders = tx
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .all();
    const workspaceItems = tx.select().from(items).where(eq(items.workspaceId, workspaceId)).all();
    const foldersById = new Map(workspaceFolders.map((folder) => [folder.id, folder] as const));
    const itemsById = new Map(workspaceItems.map((item) => [item.id, item] as const));

    if (destinationFolderId !== null && !foldersById.has(destinationFolderId)) {
      throw new Error(
        `Destination folder "${destinationFolderId}" does not exist in this workspace.`,
      );
    }

    const uniqueItems: { kind: "item" | "folder"; id: string }[] = [];
    const seenItems = new Set<string>();
    for (const item of itemRefs) {
      const key = `${item.kind}:${item.id}`;
      if (!seenItems.has(key)) {
        seenItems.add(key);
        uniqueItems.push(item);
      }
    }

    for (const item of uniqueItems) {
      const exists = item.kind === "folder" ? foldersById.has(item.id) : itemsById.has(item.id);
      if (!exists) {
        throw new Error(
          `${item.kind === "folder" ? "Folder" : "Item"} "${item.id}" does not exist in this workspace.`,
        );
      }
    }

    const selectedFolderIds = new Set(
      uniqueItems.filter((item) => item.kind === "folder").map((item) => item.id),
    );
    const coveredFolderIds = new Set<string>();

    for (const folderId of selectedFolderIds) {
      if (
        destinationFolderId !== null &&
        wouldFolderParentCreateCycle(folderId, destinationFolderId, foldersById)
      ) {
        throw new Error(
          `Folder "${folderId}" cannot be moved into itself or one of its descendants.`,
        );
      }

      let parentId = foldersById.get(folderId)?.parentId ?? null;
      while (parentId !== null) {
        if (selectedFolderIds.has(parentId)) {
          coveredFolderIds.add(folderId);
          break;
        }
        parentId = foldersById.get(parentId)?.parentId ?? null;
      }
    }

    const movedItems: { kind: "item" | "folder"; id: string }[] = [];
    const unchangedItems: { kind: "item" | "folder"; id: string }[] = [];
    const skippedItems: { kind: "item" | "folder"; id: string; reason: string }[] = [];
    const movedFolderIds: string[] = [];
    const movedItemIds: string[] = [];

    for (const item of uniqueItems) {
      if (item.kind === "folder") {
        if (coveredFolderIds.has(item.id)) {
          skippedItems.push({ ...item, reason: "Moved with its selected parent folder." });
          continue;
        }

        if (foldersById.get(item.id)?.parentId === destinationFolderId) {
          unchangedItems.push(item);
        } else {
          movedItems.push(item);
          movedFolderIds.push(item.id);
        }
        continue;
      }

      let folderId = itemsById.get(item.id)?.folderId ?? null;
      let coveredBySelectedFolder = false;
      while (folderId !== null) {
        if (selectedFolderIds.has(folderId)) {
          coveredBySelectedFolder = true;
          break;
        }
        folderId = foldersById.get(folderId)?.parentId ?? null;
      }

      if (coveredBySelectedFolder) {
        skippedItems.push({ ...item, reason: "Moved with its selected parent folder." });
      } else if (itemsById.get(item.id)?.folderId === destinationFolderId) {
        unchangedItems.push(item);
      } else {
        movedItems.push(item);
        movedItemIds.push(item.id);
      }
    }

    const updatedAt = Date.now();
    if (movedFolderIds.length > 0) {
      tx.update(folders)
        .set({ parentId: destinationFolderId, updatedAt })
        .where(inArray(folders.id, movedFolderIds))
        .run();
    }
    if (movedItemIds.length > 0) {
      tx.update(items)
        .set({ folderId: destinationFolderId, updatedAt })
        .where(inArray(items.id, movedItemIds))
        .run();
    }

    return { workspaceId, movedItems, unchangedItems, skippedItems };
  });
}

export function updateItemTitle(id: string, title: string): ItemRow {
  requireItemById(id);
  getAppDatabase()
    .update(items)
    .set({ title, updatedAt: Date.now() })
    .where(eq(items.id, id))
    .run();
  return requireItemById(id);
}

export function moveItem(id: string, folderId: string | null): ItemRow {
  return getAppDatabase().transaction((tx) => {
    const item = tx.select().from(items).where(eq(items.id, id)).get();
    if (!item) throw new Error(`Item "${id}" does not exist.`);

    if (folderId !== null) {
      const folder = tx.select().from(folders).where(eq(folders.id, folderId)).get();
      if (!folder) throw new Error(`Folder "${folderId}" does not exist.`);
      if (folder.workspaceId !== item.workspaceId) {
        throw new Error(`Folder "${folderId}" belongs to a different workspace.`);
      }
    }

    tx.update(items).set({ folderId, updatedAt: Date.now() }).where(eq(items.id, id)).run();
    const updated = tx.select().from(items).where(eq(items.id, id)).get();
    if (!updated) throw new Error(`Item "${id}" does not exist.`);
    return toItemRow(updated);
  });
}

export function deleteItem(id: string): ItemRow {
  const item = requireItemById(id);
  getAppDatabase().delete(items).where(eq(items.id, id)).run();
  return item;
}

export function createTerminal(input: {
  workspaceId: string;
  title: string;
  folderId: string | null;
  data: TerminalItemData;
}): TerminalRow {
  requireWorkspaceExists(input.workspaceId);
  if (input.folderId !== null) {
    const folder = requireFolderById(input.folderId);
    if (folder.workspaceId !== input.workspaceId) {
      throw new Error(`Folder "${input.folderId}" belongs to a different workspace.`);
    }
  }

  const id = createUuidV7();
  getAppDatabase()
    .insert(items)
    .values({
      id,
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      type: "terminal",
      title: input.title,
      data: input.data,
    })
    .run();
  const terminal = requireItemById(id);
  if (terminal.type !== "terminal") throw new Error(`Item "${id}" is not a terminal.`);
  return terminal;
}

export function createMarkdown(input: {
  workspaceId: string;
  title: string;
  folderId: string | null;
}): MarkdownRow {
  requireWorkspaceExists(input.workspaceId);
  if (input.folderId !== null) {
    const folder = requireFolderById(input.folderId);
    if (folder.workspaceId !== input.workspaceId) {
      throw new Error(`Folder "${input.folderId}" belongs to a different workspace.`);
    }
  }

  const id = createUuidV7();
  getAppDatabase()
    .insert(items)
    .values({
      id,
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      type: "markdown",
      title: input.title,
      data: { markdown: "" },
    })
    .run();
  const markdown = requireItemById(id);
  if (markdown.type !== "markdown") throw new Error(`Item "${id}" is not Markdown.`);
  return markdown;
}

export function updateMarkdownContent(id: string, markdown: string): MarkdownRow {
  const item = requireItemById(id);
  if (item.type !== "markdown") throw new Error(`Item "${id}" is not Markdown.`);
  getAppDatabase()
    .update(items)
    .set({ data: { ...item.data, markdown }, updatedAt: Date.now() })
    .where(eq(items.id, id))
    .run();
  const updated = requireItemById(id);
  if (updated.type !== "markdown") throw new Error(`Item "${id}" is not Markdown.`);
  return updated;
}

export function updateTerminalData(
  id: string,
  update: Partial<TerminalItemData>,
  options?: { touchUpdatedAt?: boolean },
): TerminalRow {
  const terminal = requireItemById(id);
  if (terminal.type !== "terminal") throw new Error(`Item "${id}" is not a terminal.`);
  getAppDatabase()
    .update(items)
    .set({
      data: normalizeTerminalData({ ...terminal.data, ...update }),
      ...(options?.touchUpdatedAt === false ? {} : { updatedAt: Date.now() }),
    })
    .where(eq(items.id, id))
    .run();
  const updated = requireItemById(id);
  if (updated.type !== "terminal") throw new Error(`Item "${id}" is not a terminal.`);
  return updated;
}

export function createChat(input: {
  workspaceId: string;
  title: string;
  folderId: string | null;
}): ChatRow {
  requireWorkspaceExists(input.workspaceId);

  if (input.folderId !== null) {
    const folder = requireFolderById(input.folderId);
    if (folder.workspaceId !== input.workspaceId) {
      throw new Error(`Folder "${input.folderId}" belongs to a different workspace.`);
    }
  }

  const id = createUuidV7();

  getAppDatabase()
    .insert(items)
    .values({
      id,
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      type: "chat",
      title: input.title,
      data: { settings: {} },
    })
    .run();

  return requireChatById(id);
}

export function updateChatTitle(id: string, title: string): ChatRow {
  updateItemTitle(id, title);
  return requireChatById(id);
}

export function updateChatSettings(id: string, settingsPatch: ChatSettingsPatch): ChatRow {
  const chat = requireChatById(id);
  getAppDatabase()
    .update(items)
    .set({
      data: {
        ...chat.data,
        settings: mergeChatSettings(chat.data.settings, settingsPatch),
      },
      updatedAt: Date.now(),
    })
    .where(eq(items.id, id))
    .run();

  return requireChatById(id);
}

export function moveChat(id: string, folderId: string | null): ChatRow {
  requireChatById(id);
  moveItem(id, folderId);
  return requireChatById(id);
}

export function deleteChat(id: string): ChatRow {
  const chat = requireChatById(id);
  getAppDatabase().delete(items).where(eq(items.id, id)).run();
  return chat;
}

export function cloneChat(chatId: string): ChatRow {
  const sourceChat = requireChatById(chatId);
  const newChatId = createUuidV7();

  getAppDatabase()
    .insert(items)
    .values({
      id: newChatId,
      workspaceId: sourceChat.workspaceId,
      folderId: sourceChat.folderId,
      type: "chat",
      title: `${sourceChat.title} (Copy)`,
      data: { ...sourceChat.data, currentBranchId: undefined },
    })
    .run();

  // Clone all messages with remapped IDs
  const sourceMessages = listAllMessagesByChatId(chatId);

  if (sourceMessages.length > 0) {
    const oldToNewId = new Map<string, string>();

    for (const message of sourceMessages) {
      const newMessageId = createUuidV7();
      oldToNewId.set(message.id, newMessageId);
    }

    for (const message of sourceMessages) {
      const newId = oldToNewId.get(message.id)!;
      const newParentId =
        message.parentId != null ? (oldToNewId.get(message.parentId) ?? null) : null;

      upsertMessage({
        id: newId,
        chatId: newChatId,
        parentId: newParentId,
        role: message.role,
        parts: message.parts as unknown[],
        metadata: message.metadata,
      });
    }

    // Remap the currentBranchId from the source chat
    const sourceBranchId = getChatCurrentBranchId(chatId);
    if (sourceBranchId != null) {
      const remappedBranchId = oldToNewId.get(sourceBranchId) ?? null;
      setChatCurrentBranch(newChatId, remappedBranchId);
    }
  }

  return requireChatById(newChatId);
}

export function setChatCurrentBranch(
  chatId: string,
  branchId: string | null,
  options?: {
    settingsPatch?: ChatSettingsPatch;
  },
): void {
  const db = getAppDatabase();
  const existing = db
    .select()
    .from(items)
    .where(and(eq(items.id, chatId), eq(items.type, "chat")))
    .get();
  if (!existing) return;
  const currentData = normalizeChatData(existing.data);
  db.update(items)
    .set({
      data: {
        ...currentData,
        settings: mergeChatSettings(currentData.settings, options?.settingsPatch),
        currentBranchId: branchId ?? undefined,
      },
      updatedAt: Date.now(),
    })
    .where(eq(items.id, chatId))
    .run();
}

export function getChatCurrentBranchId(chatId: string): string | null {
  const db = getAppDatabase();
  const row = db
    .select()
    .from(items)
    .where(and(eq(items.id, chatId), eq(items.type, "chat")))
    .get();
  if (!row) return null;
  const data = row.data as Record<string, unknown> | null;
  const branchId = data?.currentBranchId;
  return typeof branchId === "string" ? branchId : null;
}
