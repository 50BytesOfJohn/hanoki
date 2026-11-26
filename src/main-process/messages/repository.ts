import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getAppDatabase } from "../db/database";
import { messages } from "../db/schema";

export type MessageTableRow = typeof messages.$inferSelect;
export type MessageRole = "system" | "user" | "assistant";

interface MessageTreeNode {
  id: string;
  parentId: string | null;
  createdAt: number;
}

const MESSAGE_IN_CLAUSE_CHUNK_SIZE = 500;

export interface MessageRow {
  id: string;
  chatId: string;
  parentId: string | null;
  role: MessageRole;
  parts: unknown[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  siblings?: string[];
  siblingIndex?: number;
}

export interface UpsertMessageInput {
  id: string;
  chatId: string;
  parentId: string | null;
  role: MessageRole;
  parts: unknown[];
  metadata: Record<string, unknown>;
}

/**
 * Returns the linear message history for a chat by tracing from a leaf back to the root.
 *
 * When `branchId` is provided, the leaf is the latest leaf reachable from that branch node.
 * When `branchId` is null/undefined, the leaf is the most recently created leaf across all branches.
 *
 * Messages are returned in conversation order: root first, leaf last.
 */
export function listMessagesByChatId(chatId: string, branchId?: string | null): MessageRow[] {
  // Query only lightweight tree columns first so inactive branches never read or
  // JSON-parse `parts` / `metadata` blobs during chat opens or branch switches.
  const allNodes = loadMessageTreeNodesByChatId(chatId);

  if (allNodes.length === 0) {
    return [];
  }

  const { childrenByParentId, nodeMap } = buildMessageNodeIndexes(allNodes);

  // Find the leaf from which we will trace back to the root.
  let leafNode: MessageTreeNode | undefined;

  if (branchId != null) {
    const branchNode = nodeMap.get(branchId);
    if (!branchNode) {
      throw new Error(`Branch message "${branchId}" does not exist in chat "${chatId}".`);
    }
    leafNode = findLatestLeafInSubtree(branchId, allNodes, childrenByParentId);
  } else {
    leafNode = findLatestLeaf(allNodes, childrenByParentId);
  }

  if (!leafNode) {
    return [];
  }

  // Trace path from leaf back to root.
  const pathIds: string[] = [];
  let current: MessageTreeNode | undefined = leafNode;
  const visited = new Set<string>(); // guard against corrupt parent cycles

  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    pathIds.push(current.id);
    current = current.parentId != null ? nodeMap.get(current.parentId) : undefined;
  }

  // Reverse so the path runs root → leaf.
  pathIds.reverse();

  const pathRowsById = loadMessagesByIds(pathIds);
  const pathRows: MessageTableRow[] = [];
  for (const id of pathIds) {
    const row = pathRowsById.get(id);
    if (row) {
      pathRows.push(row);
    }
  }

  return addSiblingMetadata(pathRows, childrenByParentId);
}

export function listAllMessagesByChatId(chatId: string): MessageRow[] {
  const allMessages = loadAllMessagesByChatId(chatId);

  if (allMessages.length === 0) {
    return [];
  }

  const { childrenByParentId } = buildMessageNodeIndexes(allMessages);
  return addSiblingMetadata(allMessages, childrenByParentId);
}

export function getMessageById(id: string): MessageRow | null {
  const row = getAppDatabase().select().from(messages).where(eq(messages.id, id)).get();
  return row ? toMessageRow(row) : null;
}

export function setMessagePinned(id: string, pinned: boolean): MessageRow {
  const db = getAppDatabase();
  const existing = db.select().from(messages).where(eq(messages.id, id)).get();
  if (!existing) {
    throw new Error(`Message "${id}" does not exist.`);
  }

  const existingMetadata = normalizeJsonObject(existing.metadata);
  db.update(messages)
    .set({
      metadata: { ...existingMetadata, pinned },
      updatedAt: Date.now(),
    })
    .where(eq(messages.id, id))
    .run();

  const saved = db.select().from(messages).where(eq(messages.id, id)).get();
  return toMessageRow(saved!);
}

export function listPinnedMessages(): MessageRow[] {
  return getAppDatabase()
    .select()
    .from(messages)
    .where(sql`json_extract(${messages.metadata}, '$.pinned') = 1`)
    .orderBy(desc(messages.updatedAt))
    .all()
    .map(toMessageRow);
}

export function upsertMessage(input: UpsertMessageInput): MessageRow {
  const db = getAppDatabase();
  const existing = db.select().from(messages).where(eq(messages.id, input.id)).get();

  if (!existing) {
    db.insert(messages)
      .values({
        id: input.id,
        chatId: input.chatId,
        parentId: input.parentId,
        role: input.role,
        parts: input.parts,
        metadata: input.metadata,
      })
      .run();
  } else {
    db.update(messages)
      .set({
        chatId: input.chatId,
        parentId: input.parentId,
        role: input.role,
        parts: input.parts,
        metadata: input.metadata,
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, input.id))
      .run();
  }

  const saved = db.select().from(messages).where(eq(messages.id, input.id)).get();
  if (!saved) {
    throw new Error(`Message "${input.id}" could not be saved.`);
  }

  return toMessageRow(saved);
}

export interface DeleteMessageSubtreeResult {
  chatId: string;
  parentId: string | null;
  deletedIds: Set<string>;
}

/**
 * Deletes a message subtree.
 *
 * scope "message": the message itself plus all of its descendants.
 * scope "branch": every sibling sharing the message's parentId (including the
 * message itself) plus all of their descendants.
 */
export function deleteMessageSubtree(
  messageId: string,
  scope: "message" | "branch",
): DeleteMessageSubtreeResult {
  const db = getAppDatabase();
  const target = db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      parentId: messages.parentId,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .get();
  if (!target) {
    throw new Error(`Message "${messageId}" does not exist.`);
  }

  const allNodes = loadMessageTreeNodesByChatId(target.chatId);
  const { childrenByParentId } = buildMessageNodeIndexes(allNodes);

  const rootIds =
    scope === "branch"
      ? (childrenByParentId.get(target.parentId) ?? [target]).map((message) => message.id)
      : [target.id];

  const deletedIds = new Set<string>();
  const stack = [...rootIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (deletedIds.has(id)) {
      continue;
    }
    deletedIds.add(id);
    for (const child of childrenByParentId.get(id) ?? []) {
      stack.push(child.id);
    }
  }

  const idsToDelete = [...deletedIds];
  for (let offset = 0; offset < idsToDelete.length; offset += MESSAGE_IN_CLAUSE_CHUNK_SIZE) {
    db.delete(messages)
      .where(inArray(messages.id, idsToDelete.slice(offset, offset + MESSAGE_IN_CLAUSE_CHUNK_SIZE)))
      .run();
  }

  return { chatId: target.chatId, parentId: target.parentId, deletedIds };
}

/**
 * Returns the most recently created leaf message (a message with no children)
 * across all branches of the chat.
 *
 * `allMessages` must be sorted ascending by createdAt so iterating in reverse
 * yields the latest message first.
 */
function findLatestLeaf<T extends MessageTreeNode>(
  allMessages: readonly T[],
  childrenByParentId: Map<string | null, T[]>,
): T | undefined {
  // Iterate newest → oldest; return the first message that has no children.
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i]!;
    const children = childrenByParentId.get(msg.id);
    if (!children || children.length === 0) {
      return msg;
    }
  }
  return undefined;
}

/**
 * Returns the most recently created leaf reachable from `rootId` (inclusive).
 *
 * Performs a depth-first traversal of the subtree rooted at `rootId`, then
 * picks the latest leaf by createdAt among all discovered leaf nodes.
 */
function findLatestLeafInSubtree<T extends MessageTreeNode>(
  rootId: string,
  allMessages: readonly T[],
  childrenByParentId: Map<string | null, T[]>,
): T | undefined {
  // Collect all descendant IDs (including rootId itself).
  const descendants = new Set<string>();
  const stack: string[] = [rootId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (descendants.has(id)) {
      continue;
    }
    descendants.add(id);
    const children = childrenByParentId.get(id);
    if (children) {
      for (const child of children) {
        stack.push(child.id);
      }
    }
  }

  // allMessages is sorted asc; iterate in reverse for latest-first.
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i]!;
    if (!descendants.has(msg.id)) {
      continue;
    }
    const children = childrenByParentId.get(msg.id);
    if (!children || children.length === 0) {
      return msg;
    }
  }

  return undefined;
}

function toMessageRow(row: MessageTableRow): MessageRow {
  return {
    id: row.id,
    chatId: row.chatId,
    parentId: row.parentId,
    role: parseMessageRole(row.role),
    parts: normalizeJsonArray(row.parts),
    metadata: normalizeJsonObject(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseMessageRole(value: string): MessageRole {
  if (value === "system" || value === "user" || value === "assistant") {
    return value;
  }

  throw new Error(`Unsupported message role "${value}".`);
}

function normalizeJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function loadMessageTreeNodesByChatId(chatId: string): MessageTreeNode[] {
  return getAppDatabase()
    .select({
      id: messages.id,
      parentId: messages.parentId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
}

function loadMessagesByIds(ids: readonly string[]): Map<string, MessageTableRow> {
  const rowsById = new Map<string, MessageTableRow>();
  if (ids.length === 0) {
    return rowsById;
  }

  const db = getAppDatabase();
  for (let offset = 0; offset < ids.length; offset += MESSAGE_IN_CLAUSE_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + MESSAGE_IN_CLAUSE_CHUNK_SIZE);
    const rows = db.select().from(messages).where(inArray(messages.id, chunk)).all();
    for (const row of rows) {
      rowsById.set(row.id, row);
    }
  }

  return rowsById;
}

function loadAllMessagesByChatId(chatId: string): MessageTableRow[] {
  return getAppDatabase()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
}

function buildMessageNodeIndexes<T extends MessageTreeNode>(
  allNodes: readonly T[],
): {
  childrenByParentId: Map<string | null, T[]>;
  nodeMap: Map<string, T>;
} {
  const nodeMap = new Map<string, T>();
  const childrenByParentId = new Map<string | null, T[]>();

  for (const node of allNodes) {
    nodeMap.set(node.id, node);

    const siblings = childrenByParentId.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParentId.set(node.parentId, siblings);
  }

  return {
    childrenByParentId,
    nodeMap,
  };
}

function addSiblingMetadata(
  rows: readonly MessageTableRow[],
  childrenByParentId: Map<string | null, readonly MessageTreeNode[]>,
): MessageRow[] {
  return rows.map((message) => {
    const row = toMessageRow(message);
    const siblings = childrenByParentId.get(message.parentId) ?? [];

    if (siblings.length > 1) {
      const siblingIds = siblings.map((sibling) => sibling.id);
      row.siblings = siblingIds;
      row.siblingIndex = siblingIds.indexOf(message.id);
    }

    return row;
  });
}
