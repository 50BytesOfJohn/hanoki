import { describe, expect, it } from "vitest";

import { createTiptapDocumentFromText } from "@shared/tiptap/document";
import {
  EMPTY_CHAT_QUEUE,
  enqueue,
  moveToFront,
  nextSendable,
  removeItem,
  restoreItem,
  toQueuePreview,
  updateItem,
  type ChatQueue,
  type QueuedMessage,
} from "./chat-queue";

function item(id: string): QueuedMessage {
  return { id, document: createTiptapDocumentFromText(id), preview: id };
}

function queueOf(...ids: string[]): ChatQueue {
  return ids.reduce((queue, id) => enqueue(queue, item(id)), EMPTY_CHAT_QUEUE);
}

const ids = (queue: ChatQueue) => queue.items.map((candidate) => candidate.id);

describe("chat queue", () => {
  it("sends in the order messages were queued", () => {
    expect(nextSendable(queueOf("a", "b"))?.id).toBe("a");
  });

  it("holds everything while paused", () => {
    expect(nextSendable({ ...queueOf("a"), pausedBy: "stopped" })).toBeNull();
  });

  it("holds the queue while its head is open for editing, but not for a later item", () => {
    expect(nextSendable({ ...queueOf("a", "b"), editingId: "a" })).toBeNull();
    expect(nextSendable({ ...queueOf("a", "b"), editingId: "b" })?.id).toBe("a");
  });

  it("clears the edit and the pause along with the last item", () => {
    const queue = removeItem({ ...queueOf("a"), editingId: "a", pausedBy: "error" }, "a");
    expect(queue).toEqual(EMPTY_CHAT_QUEUE);
  });

  it("undoes a removal at the original position", () => {
    const before = queueOf("a", "b", "c");
    const removed = removeItem(before, "b");
    expect(ids(restoreItem(removed, item("b"), 1))).toEqual(["a", "b", "c"]);
    // The queue may have drained meanwhile; the item still comes back.
    expect(ids(restoreItem(EMPTY_CHAT_QUEUE, item("b"), 1))).toEqual(["b"]);
  });

  it("doesn't restore an item twice", () => {
    const queue = queueOf("a");
    expect(restoreItem(queue, item("a"), 0)).toBe(queue);
  });

  it("moves an item to the front for send-now", () => {
    expect(ids(moveToFront(queueOf("a", "b", "c"), "c"))).toEqual(["c", "a", "b"]);
  });

  it("updates an item in place", () => {
    const document = createTiptapDocumentFromText("edited");
    const queue = updateItem(queueOf("a", "b"), "a", { document, preview: "edited" });
    expect(queue.items[0]).toEqual({ id: "a", document, preview: "edited" });
    expect(ids(queue)).toEqual(["a", "b"]);
  });

  it("collapses whitespace in previews", () => {
    expect(toQueuePreview("  first line\n\nsecond\tline ")).toBe("first line second line");
  });
});
