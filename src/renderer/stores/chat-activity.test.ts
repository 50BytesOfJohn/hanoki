import { describe, expect, it } from "vitest";

import {
  applyChatStatus,
  markRead,
  sortActivity,
  type ChatActivityEntries,
  type ChatStatusEvent,
} from "./chat-activity";

const base = {
  chatId: "chat-1",
  workspaceId: "ws-1",
  isVisible: false,
  at: 1_000,
} satisfies Omit<ChatStatusEvent, "status">;

function run(entries: ChatActivityEntries, ...events: Partial<ChatStatusEvent>[]) {
  return events.reduce<ChatActivityEntries>(
    (acc, event) => applyChatStatus(acc, { ...base, status: "ready", ...event }),
    entries,
  );
}

describe("applyChatStatus", () => {
  it("ignores the 'ready' a freshly opened chat reports", () => {
    expect(run({}, { status: "ready" })).toEqual({});
  });

  it("marks a streaming chat as working", () => {
    expect(run({}, { status: "submitted" })["chat-1"]).toMatchObject({
      kind: "working",
      since: 1_000,
      outcome: "running",
    });
  });

  it("keeps the original start time across submitted → streaming", () => {
    const entries = run({}, { status: "submitted" }, { status: "streaming", at: 5_000 });
    expect(entries["chat-1"].since).toBe(1_000);
  });

  it("turns a finished run the user missed into unread", () => {
    const entries = run({}, { status: "streaming" }, { status: "ready", at: 9_000 });
    expect(entries["chat-1"]).toMatchObject({ kind: "unread", since: 9_000, outcome: "done" });
  });

  it("records a failed run as unread with an error outcome", () => {
    const entries = run({}, { status: "streaming" }, { status: "error" });
    expect(entries["chat-1"].outcome).toBe("error");
  });

  it("does not mark a run the user watched finish", () => {
    const entries = run({}, { status: "streaming" }, { status: "ready", isVisible: true });
    expect(entries).toEqual({});
  });

  it("keeps the workspace the run started in", () => {
    const entries = run({}, { status: "streaming", workspaceId: "ws-2" }, { status: "ready" });
    expect(entries["chat-1"].workspaceId).toBe("ws-2");
  });
});

describe("markRead", () => {
  it("drops unread chats but leaves working ones counting", () => {
    const entries = run(run({}, { status: "streaming" }, { status: "ready" }), {
      chatId: "chat-2",
      status: "streaming",
    });

    expect(Object.keys(markRead(entries, ["chat-1", "chat-2"]))).toEqual(["chat-2"]);
  });

  it("returns the same object when nothing changes", () => {
    const entries = run({}, { status: "streaming" });
    expect(markRead(entries, ["chat-9"])).toBe(entries);
  });
});

describe("sortActivity", () => {
  it("puts working first (oldest run leading), then unread (newest reply leading)", () => {
    const entries = [
      { chatId: "old-unread", kind: "unread", since: 10 },
      { chatId: "new-work", kind: "working", since: 40 },
      { chatId: "new-unread", kind: "unread", since: 30 },
      { chatId: "old-work", kind: "working", since: 20 },
    ].map((entry) => ({ ...entry, workspaceId: "ws-1", outcome: "done" }));

    expect(sortActivity(entries as never).map((entry) => entry.chatId)).toEqual([
      "old-work",
      "new-work",
      "new-unread",
      "old-unread",
    ]);
  });
});
