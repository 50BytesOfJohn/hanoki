import { describe, expect, it } from "vitest";
import {
  GENERATED_TITLE_MAX_LENGTH,
  sanitizeGeneratedTitle,
  titleFromModelText,
} from "./chat-title";

describe("titleFromModelText", () => {
  it("reads JSON and strips quotes, emoji, and trailing punctuation", () => {
    expect(titleFromModelText('{"title":"\\"Bridge collapse for Kael.\\" 🌧️"}', "chat")).toBe(
      "Bridge collapse for Kael",
    );
  });

  it("caps the title and makes note titles filename-safe", () => {
    expect(sanitizeGeneratedTitle("a".repeat(80), "chat")).toHaveLength(GENERATED_TITLE_MAX_LENGTH);
    expect(sanitizeGeneratedTitle("Ch 03 / The Bridge:", "note")).toBe("Ch 03 The Bridge");
  });

  it("rejects an empty title", () => {
    expect(titleFromModelText("   ", "chat")).toBeNull();
    expect(titleFromModelText('{"title":""}', "note")).toBeNull();
  });
});
