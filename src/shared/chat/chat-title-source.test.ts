import { describe, expect, it } from "vitest";
import {
  buildChatTitleSource,
  CHAT_TITLE_PACK_MAX_LENGTH,
  firstUserTitleLine,
} from "./chat-title-source";

describe("Chat title source", () => {
  it("packs the first user messages, the latest user, and a short first reply", () => {
    const source = buildChatTitleSource([
      { role: "system", text: "You are a tool dump " + "x".repeat(500) },
      { role: "user", text: "Rewrite the bridge collapse so Kael chooses to stay." },
      { role: "assistant", text: "A".repeat(2_000) },
      { role: "user", text: "Keep the archivist." },
      { role: "user", text: "Cut the weather." },
      { role: "user", text: "End on the lantern." },
      { role: "tool", text: "search results " + "y".repeat(800) },
    ]);

    expect(source).toContain("User: Rewrite the bridge collapse so Kael chooses to stay.");
    expect(source).toContain("User: Keep the archivist.");
    expect(source).toContain("User: Cut the weather.");
    expect(source).not.toContain("User: End on the lantern.");
    expect(source).toContain("Latest user: End on the lantern.");
    expect(source).toContain(`Assistant: ${"A".repeat(200)}`);
    expect(source).not.toContain("tool dump");
    expect(source).not.toContain("search results");
    expect(source!.length).toBeLessThanOrEqual(CHAT_TITLE_PACK_MAX_LENGTH);
  });

  it("drops fenced code and empty transcripts", () => {
    expect(
      buildChatTitleSource([
        { role: "user", text: "Fix the ending.\n```ts\nconst huge = true;\n```\nKeep Kael." },
      ]),
    ).toBe("User: Fix the ending. Keep Kael.");
    expect(buildChatTitleSource([{ role: "user", text: "  " }])).toBeNull();
    expect(firstUserTitleLine([{ role: "user", text: "Fix the ending." }])).toBe("Fix the ending.");
  });
});
