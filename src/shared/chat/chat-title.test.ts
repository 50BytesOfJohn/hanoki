import { describe, expect, it } from "vitest";
import { normalizeGeneratedTitle } from "./chat-title";

describe("normalizeGeneratedTitle", () => {
  it("keeps a specific title and strips wrapping the model adds", () => {
    expect(normalizeGeneratedTitle('Title: "Ch 03 — The Bridge."')).toBe("Ch 03 — The Bridge");
  });

  it("rejects an empty title", () => {
    expect(() => normalizeGeneratedTitle("   ")).toThrow(/invalid item title/);
  });
});
