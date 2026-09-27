import { describe, expect, it } from "vitest";

import { formatAttachedContextInstructions, HANOKI_READ_CHAR_CEILING } from "./attached-items";

describe("formatAttachedContextInstructions", () => {
  it("lists pointers and the read ceilings without bodies", () => {
    const text = formatAttachedContextInstructions([
      { kind: "note", itemId: "note-1", title: "Plan" },
      { kind: "chat", itemId: "chat-1", title: null },
    ]);

    expect(text).toContain("pointers only");
    expect(text).toContain("Do not read every mentioned item");
    expect(text).toContain(String(HANOKI_READ_CHAR_CEILING));
    expect(text).toContain("beforeMessageId");
    expect(text).toContain("refuses the chat that is hosting this turn");
    expect(text).toContain('kind: note, itemId: note-1, title: "Plan"');
    expect(text).toContain("kind: chat, itemId: chat-1, title: null (missing)");
    expect(text).not.toContain("body text");
  });

  it("returns null when nothing is mentioned", () => {
    expect(formatAttachedContextInstructions([])).toBeNull();
  });
});
