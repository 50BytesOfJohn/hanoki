import { describe, expect, it } from "vitest";
import { buildChatTitleSource } from "./chat-title-source";

describe("Chat title source", () => {
  it("keeps the user's goal and only a short assistant excerpt", () => {
    const source = buildChatTitleSource([
      { role: "user", text: "Rewrite the bridge collapse so Kael chooses to stay." },
      { role: "assistant", text: "A".repeat(2_000) },
      { role: "user", text: "Keep the archivist in the scene." },
    ]);

    expect(source).toContain("User: Rewrite the bridge collapse so Kael chooses to stay.");
    expect(source).toContain("User: Keep the archivist in the scene.");
    expect(source).toContain("Assistant: ");
    expect(source?.split("Assistant: ")[1]).toHaveLength(400 - "Assistant: ".length);
  });

  it("returns null when the transcript has no text", () => {
    expect(buildChatTitleSource([{ role: "user", text: "  " }])).toBeNull();
  });
});
