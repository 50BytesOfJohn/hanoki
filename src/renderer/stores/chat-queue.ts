import type { TiptapDocument } from "@shared/tiptap/document";

/** A message written while a reply was still generating, waiting for its turn. */
export interface QueuedMessage {
  id: string;
  document: TiptapDocument;
  /** One-line plain text for the queue row. */
  preview: string;
}

/** Why a chat's queue is not sending on its own. */
export type ChatQueuePauseReason = "stopped" | "error";

export interface ChatQueue {
  items: QueuedMessage[];
  pausedBy: ChatQueuePauseReason | null;
  /** The item open in the composer for editing; it and everything after it wait. */
  editingId: string | null;
}

export const EMPTY_CHAT_QUEUE: ChatQueue = {
  items: [],
  pausedBy: null,
  editingId: null,
};

export function enqueue(queue: ChatQueue, item: QueuedMessage): ChatQueue {
  return { ...queue, items: [...queue.items, item] };
}

export function removeItem(queue: ChatQueue, id: string): ChatQueue {
  const items = queue.items.filter((item) => item.id !== id);
  if (items.length === queue.items.length) return queue;
  return {
    ...queue,
    items,
    editingId: queue.editingId === id ? null : queue.editingId,
    // An empty queue has nothing left to pause.
    pausedBy: items.length === 0 ? null : queue.pausedBy,
  };
}

/** Puts a removed item back where it was, for undo. */
export function restoreItem(queue: ChatQueue, item: QueuedMessage, index: number): ChatQueue {
  if (queue.items.some((candidate) => candidate.id === item.id)) return queue;
  const items = [...queue.items];
  items.splice(Math.min(Math.max(index, 0), items.length), 0, item);
  return { ...queue, items };
}

export function updateItem(
  queue: ChatQueue,
  id: string,
  patch: Pick<QueuedMessage, "document" | "preview">,
): ChatQueue {
  return {
    ...queue,
    items: queue.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  };
}

export function moveToFront(queue: ChatQueue, id: string): ChatQueue {
  const item = queue.items.find((candidate) => candidate.id === id);
  if (!item || queue.items[0]?.id === id) return queue;
  return {
    ...queue,
    items: [item, ...queue.items.filter((candidate) => candidate.id !== id)],
  };
}

/** The item to send next, or null while the queue is paused, empty, or its head is being edited. */
export function nextSendable(queue: ChatQueue): QueuedMessage | null {
  if (queue.pausedBy !== null) return null;
  const head = queue.items[0];
  if (!head || head.id === queue.editingId) return null;
  return head;
}

export function toQueuePreview(displayText: string): string {
  return displayText.replace(/\s+/g, " ").trim();
}
