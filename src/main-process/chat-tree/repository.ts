import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getAppDatabase } from "../db/database";
import { createUuidV7 } from "../db/uuidv7";
import { chats, folders } from "../db/schema";
import { getWorkspaceById } from "../workspaces/repository";
import { listAllMessagesByChatId, upsertMessage } from "../messages/repository";

type FolderTableRow = typeof folders.$inferSelect;
type ChatTableRow = typeof chats.$inferSelect;
type ChatSettings = {
  modelId?: string | null;
  systemPrompt?: string | null;
};
type ChatSettingsPatch = Partial<ChatSettings>;

export interface FolderRow {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatRow {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  settings: ChatSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ChatTreeFolderNode {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
  folders: ChatTreeFolderNode[];
  chats: ChatRow[];
}

export interface ChatTreeSnapshot {
  workspaceId: string;
  rootFolders: ChatTreeFolderNode[];
  rootChats: ChatRow[];
}

export interface ChatTreeFolderListItem extends FolderRow {
  childFolderCount: number;
  childChatCount: number;
}

export interface ChatTreeChildrenSlice {
  workspaceId: string;
  parentFolderId: string | null;
  folders: ChatTreeFolderListItem[];
  chats: ChatRow[];
}

export interface DeleteFolderRecursiveResult {
  workspaceId: string;
  deletedFolderIds: string[];
}

export interface DeleteChatTreeItemsResult {
  workspaceId: string;
  deletedChatIds: string[];
  deletedFolderIds: string[];
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

function toChatRow(row: ChatTableRow): ChatRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    title: row.title,
    settings: normalizeChatSettings(row.settings),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeChatSettings(value: unknown): ChatSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const modelId = record.modelId;
  const systemPrompt = record.systemPrompt;
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
  const row = getAppDatabase().select().from(chats).where(eq(chats.id, id)).get();
  return row ? toChatRow(row) : null;
}

function requireChatById(id: string): ChatRow {
  const chat = getChatById(id);
  if (!chat) {
    throw new Error(`Chat "${id}" does not exist.`);
  }

  return chat;
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

function warnInvalidChatFolder(
  workspaceId: string,
  chatId: string,
  folderId: string,
  reason: string,
): void {
  console.warn(
    `[chat-tree] Chat "${chatId}" has invalid folder "${folderId}" in workspace "${workspaceId}" (${reason}); treating as root.`,
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

  const chatRows = getAppDatabase()
    .select()
    .from(chats)
    .where(eq(chats.workspaceId, workspaceId))
    .orderBy(asc(chats.id))
    .all();

  const folderRowsById = new Map(folderRows.map((row) => [row.id, row] as const));
  const folderNodesById = new Map<string, ChatTreeFolderNode>();

  for (const row of folderRows) {
    folderNodesById.set(row.id, {
      ...toFolderRow(row),
      folders: [],
      chats: [],
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

  const rootChats: ChatRow[] = [];

  for (const row of chatRows) {
    const chat = toChatRow(row);

    if (!row.folderId) {
      rootChats.push(chat);
      continue;
    }

    const folderNode = folderNodesById.get(row.folderId);
    if (!folderNode) {
      warnInvalidChatFolder(workspaceId, row.id, row.folderId, "missing folder");
      rootChats.push(chat);
      continue;
    }

    folderNode.chats.push(chat);
  }

  return {
    workspaceId,
    rootFolders,
    rootChats,
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

  const chatRows =
    parentFolderId === null
      ? getAppDatabase()
          .select()
          .from(chats)
          .where(and(eq(chats.workspaceId, workspaceId), isNull(chats.folderId)))
          .orderBy(asc(chats.id))
          .all()
      : getAppDatabase()
          .select()
          .from(chats)
          .where(and(eq(chats.workspaceId, workspaceId), eq(chats.folderId, parentFolderId)))
          .orderBy(asc(chats.id))
          .all();

  const childFolderIds = folderRows.map((row) => row.id);
  const childFolderCountsByParentId = new Map<string, number>();
  const childChatCountsByFolderId = new Map<string, number>();

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

    const chatCountRows = getAppDatabase()
      .select({
        folderId: chats.folderId,
        count: sql<number>`count(*)`,
      })
      .from(chats)
      .where(inArray(chats.folderId, childFolderIds))
      .groupBy(chats.folderId)
      .all();

    for (const row of chatCountRows) {
      if (typeof row.folderId === "string") {
        childChatCountsByFolderId.set(row.folderId, Number(row.count) || 0);
      }
    }
  }

  return {
    workspaceId,
    parentFolderId,
    folders: folderRows.map((row) => ({
      ...toFolderRow(row),
      childFolderCount: childFolderCountsByParentId.get(row.id) ?? 0,
      childChatCount: childChatCountsByFolderId.get(row.id) ?? 0,
    })),
    chats: chatRows.map(toChatRow),
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
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.workspaceId, workspaceId), inArray(chats.id, [...ids])))
    .orderBy(asc(chats.id))
    .all()
    .map((row) => row.id);
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

    tx.delete(chats).where(inArray(chats.folderId, subtreeFolderIds)).run();
    tx.delete(folders).where(inArray(folders.id, subtreeFolderIds)).run();

    return {
      workspaceId: folder.workspaceId,
      deletedFolderIds: subtreeFolderIds,
    };
  });
}

export function deleteChatTreeItems(
  workspaceId: string,
  items: readonly {
    kind: "chat" | "folder";
    id: string;
  }[],
): DeleteChatTreeItemsResult {
  requireWorkspaceExists(workspaceId);

  if (items.length === 0) {
    return {
      workspaceId,
      deletedChatIds: [],
      deletedFolderIds: [],
    };
  }

  return getAppDatabase().transaction((tx) => {
    const selectedFolderIds = [
      ...new Set(items.filter((item) => item.kind === "folder").map((item) => item.id)),
    ];
    const selectedChatIds = [
      ...new Set(items.filter((item) => item.kind === "chat").map((item) => item.id)),
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

    for (const chatId of selectedChatIds) {
      const chat = tx.select().from(chats).where(eq(chats.id, chatId)).get();
      if (!chat) {
        throw new Error(`Chat "${chatId}" does not exist.`);
      }
      if (chat.workspaceId !== workspaceId) {
        throw new Error(`Chat "${chatId}" belongs to a different workspace.`);
      }
    }

    const workspaceFolders = tx
      .select()
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .all();
    const workspaceChats = tx
      .select({ id: chats.id, folderId: chats.folderId })
      .from(chats)
      .where(eq(chats.workspaceId, workspaceId))
      .all();

    const deletedFolderIds = new Set<string>();

    for (const folderId of selectedFolderIds) {
      const subtreeFolderIds = collectFolderSubtreeIds(workspaceFolders, folderId);
      for (const subtreeFolderId of subtreeFolderIds) {
        deletedFolderIds.add(subtreeFolderId);
      }
    }

    const deletedChatIds = new Set(selectedChatIds);

    if (deletedFolderIds.size > 0) {
      for (const chat of workspaceChats) {
        if (chat.folderId && deletedFolderIds.has(chat.folderId)) {
          deletedChatIds.add(chat.id);
        }
      }
    }

    const sortedDeletedChatIds = [...deletedChatIds].sort((left, right) =>
      left.localeCompare(right),
    );
    const sortedDeletedFolderIds = [...deletedFolderIds].sort((left, right) =>
      left.localeCompare(right),
    );

    if (sortedDeletedChatIds.length > 0) {
      tx.delete(chats).where(inArray(chats.id, sortedDeletedChatIds)).run();
    }

    if (sortedDeletedFolderIds.length > 0) {
      tx.delete(folders).where(inArray(folders.id, sortedDeletedFolderIds)).run();
    }

    return {
      workspaceId,
      deletedChatIds: sortedDeletedChatIds,
      deletedFolderIds: sortedDeletedFolderIds,
    };
  });
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
    .insert(chats)
    .values({
      id,
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      title: input.title,
    })
    .run();

  return requireChatById(id);
}

export function updateChatTitle(id: string, title: string): ChatRow {
  getAppDatabase()
    .update(chats)
    .set({
      title,
      updatedAt: Date.now(),
    })
    .where(eq(chats.id, id))
    .run();

  return requireChatById(id);
}

export function updateChatSettings(id: string, settingsPatch: ChatSettingsPatch): ChatRow {
  getAppDatabase()
    .update(chats)
    .set({
      settings: mergeChatSettings(requireChatById(id).settings, settingsPatch),
      updatedAt: Date.now(),
    })
    .where(eq(chats.id, id))
    .run();

  return requireChatById(id);
}

export function moveChat(id: string, folderId: string | null): ChatRow {
  return getAppDatabase().transaction((tx) => {
    const chat = tx.select().from(chats).where(eq(chats.id, id)).get();
    if (!chat) {
      throw new Error(`Chat "${id}" does not exist.`);
    }

    if (folderId !== null) {
      const folder = tx.select().from(folders).where(eq(folders.id, folderId)).get();
      if (!folder) {
        throw new Error(`Folder "${folderId}" does not exist.`);
      }

      if (folder.workspaceId !== chat.workspaceId) {
        throw new Error(`Folder "${folderId}" belongs to a different workspace.`);
      }
    }

    tx.update(chats)
      .set({
        folderId,
        updatedAt: Date.now(),
      })
      .where(eq(chats.id, id))
      .run();

    const updatedChat = tx.select().from(chats).where(eq(chats.id, id)).get();
    if (!updatedChat) {
      throw new Error(`Chat "${id}" does not exist.`);
    }

    return toChatRow(updatedChat);
  });
}

export function deleteChat(id: string): ChatRow {
  const chat = requireChatById(id);
  getAppDatabase().delete(chats).where(eq(chats.id, id)).run();
  return chat;
}

export function cloneChat(chatId: string): ChatRow {
  const sourceChat = requireChatById(chatId);
  const newChatId = createUuidV7();

  getAppDatabase()
    .insert(chats)
    .values({
      id: newChatId,
      workspaceId: sourceChat.workspaceId,
      folderId: sourceChat.folderId,
      title: `${sourceChat.title} (Copy)`,
      settings: sourceChat.settings,
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
  const existing = db.select().from(chats).where(eq(chats.id, chatId)).get();
  if (!existing) return;
  const currentData = (existing.data as Record<string, unknown>) ?? {};
  db.update(chats)
    .set({
      settings: mergeChatSettings(existing.settings, options?.settingsPatch),
      data: { ...currentData, currentBranchId: branchId },
      updatedAt: Date.now(),
    })
    .where(eq(chats.id, chatId))
    .run();
}

export function getChatCurrentBranchId(chatId: string): string | null {
  const db = getAppDatabase();
  const row = db.select().from(chats).where(eq(chats.id, chatId)).get();
  if (!row) return null;
  const data = row.data as Record<string, unknown> | null;
  const branchId = data?.currentBranchId;
  return typeof branchId === "string" ? branchId : null;
}
