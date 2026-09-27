import { describe, expect, it } from "vitest";

import {
  formatAttachedContextInstructions,
  HANOKI_READ_CHAR_CEILING,
  normalizeAttachedItemIds,
  parseAttachedItemIdsUpdate,
} from "./attached-items";

describe("normalizeAttachedItemIds", () => {
  it("keeps note and chat pointers and drops tool ids", () => {
    expect(
      normalizeAttachedItemIds([
        { kind: "note", itemId: "note-1" },
        { kind: "web", itemId: "web" },
        { kind: "hanoki", itemId: "hanoki" },
        { kind: "terminal", itemId: "term-1" },
        { kind: "chat", itemId: "chat-1", title: "ignored" },
        { kind: "note", itemId: "note-1" },
        { kind: "note", itemId: "" },
        "web",
      ]),
    ).toEqual([
      { kind: "note", itemId: "note-1" },
      { kind: "chat", itemId: "chat-1" },
    ]);
  });
});

describe("parseAttachedItemIdsUpdate", () => {
  it("rejects mention tool ids instead of storing them as items", () => {
    expect(() => parseAttachedItemIdsUpdate([{ kind: "web", itemId: "web" }])).toThrow(
      /kind: "note" \| "chat"/,
    );
  });
});

describe("formatAttachedContextInstructions", () => {
  it("lists pointers and the read ceilings without bodies", () => {
    const text = formatAttachedContextInstructions([
      { kind: "note", itemId: "note-1", title: "Plan" },
      { kind: "chat", itemId: "chat-1", title: null },
    ]);

    expect(text).toContain("pointers only");
    expect(text).toContain("Do not read every attached item");
    expect(text).toContain(String(HANOKI_READ_CHAR_CEILING));
    expect(text).toContain("beforeMessageId");
    expect(text).toContain("refuses the chat that is hosting this turn");
    expect(text).toContain('kind: note, itemId: note-1, title: "Plan"');
    expect(text).toContain("kind: chat, itemId: chat-1, title: null (missing)");
    expect(text).not.toContain("body text");
  });

  it("returns null when nothing is attached", () => {
    expect(formatAttachedContextInstructions([])).toBeNull();
  });
});
