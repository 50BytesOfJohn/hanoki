import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getAppDatabase } from "../db/database";
import { messages } from "../db/schema";

export type MessageTableRow = typeof messages.$inferSelect;
export type MessageRole = "system" | "user" | "assistant";

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
  const allMessages = loadAllMessagesByChatId(chatId);

  if (allMessages.length === 0) {
    return [];
  }

  const { childrenByParentId, messageMap } = buildMessageIndexes(allMessages);

  // Find the leaf from which we will trace back to the root.
  let leafMessage: MessageTableRow | undefined;

  if (branchId != null) {
    const branchMessage = messageMap.get(branchId);
    if (!branchMessage) {
      throw new Error(`Branch message "${branchId}" does not exist in chat "${chatId}".`);
    }
    leafMessage = findLatestLeafInSubtree(branchId, allMessages, childrenByParentId);
  } else {
    leafMessage = findLatestLeaf(allMessages, childrenByParentId);
  }

  if (!leafMessage) {
    return [];
  }

  // Trace path from leaf back to root.
  const path: MessageTableRow[] = [];
  let current: MessageTableRow | undefined = leafMessage;
  const visited = new Set<string>(); // guard against corrupt parent cycles

  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current);
    current = current.parentId != null ? messageMap.get(current.parentId) : undefined;
  }

  // Reverse so the path runs root → leaf.
  path.reverse();

  return addSiblingMetadata(path, childrenByParentId);
}

export function listAllMessagesByChatId(chatId: string): MessageRow[] {
  const allMessages = loadAllMessagesByChatId(chatId);

  if (allMessages.length === 0) {
    return [];
  }

  const { childrenByParentId } = buildMessageIndexes(allMessages);
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
  const target = db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!target) {
    throw new Error(`Message "${messageId}" does not exist.`);
  }

  const allMessages = loadAllMessagesByChatId(target.chatId);
  const { childrenByParentId } = buildMessageIndexes(allMessages);

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

  db.delete(messages)
    .where(inArray(messages.id, [...deletedIds]))
    .run();

  return { chatId: target.chatId, parentId: target.parentId, deletedIds };
}

/**
 * Returns the most recently created leaf message (a message with no children)
 * across all branches of the chat.
 *
 * `allMessages` must be sorted ascending by createdAt so iterating in reverse
 * yields the latest message first.
 */
function findLatestLeaf(
  allMessages: MessageTableRow[],
  childrenByParentId: Map<string | null, MessageTableRow[]>,
): MessageTableRow | undefined {
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
function findLatestLeafInSubtree(
  rootId: string,
  allMessages: MessageTableRow[],
  childrenByParentId: Map<string | null, MessageTableRow[]>,
): MessageTableRow | undefined {
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

function loadAllMessagesByChatId(chatId: string): MessageTableRow[] {
  return getAppDatabase()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
}

function buildMessageIndexes(allMessages: MessageTableRow[]): {
  childrenByParentId: Map<string | null, MessageTableRow[]>;
  messageMap: Map<string, MessageTableRow>;
} {
  const messageMap = new Map<string, MessageTableRow>();
  const childrenByParentId = new Map<string | null, MessageTableRow[]>();

  for (const message of allMessages) {
    messageMap.set(message.id, message);

    const siblings = childrenByParentId.get(message.parentId) ?? [];
    siblings.push(message);
    childrenByParentId.set(message.parentId, siblings);
  }

  return {
    childrenByParentId,
    messageMap,
  };
}

function addSiblingMetadata(
  rows: readonly MessageTableRow[],
  childrenByParentId: Map<string | null, MessageTableRow[]>,
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
