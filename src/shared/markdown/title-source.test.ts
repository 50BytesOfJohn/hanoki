import { describe, expect, it } from "vitest";
import {
  buildMarkdownTitleSource,
  isReplaceableItemTitle,
  ITEM_TITLE_SOURCE_MAX_LENGTH,
  MARKDOWN_TITLE_SOURCE_MAX_WORDS,
  shouldCommitGeneratedTitle,
} from "./title-source";

describe("Generated title commit", () => {
  it("auto-replaces only default titles and never a title that changed mid-flight", () => {
    expect(isReplaceableItemTitle("New chat")).toBe(true);
    expect(isReplaceableItemTitle("New markdown")).toBe(true);
    expect(isReplaceableItemTitle("Untitled")).toBe(true);
    expect(isReplaceableItemTitle("Ch 03 — The Bridge")).toBe(false);

    expect(shouldCommitGeneratedTitle("auto", "New chat", "New chat")).toBe(true);
    expect(shouldCommitGeneratedTitle("auto", "Kael — voice", "Kael — voice")).toBe(false);
    expect(shouldCommitGeneratedTitle("auto", "New chat", "Kael — voice")).toBe(false);
    expect(shouldCommitGeneratedTitle("explicit", "Kael — voice", "Kael — voice")).toBe(true);
    expect(shouldCommitGeneratedTitle("explicit", "New chat", "Kael — voice")).toBe(false);
  });
});

describe("Markdown title source", () => {
  it("uses at most the first 500 whitespace-delimited words", () => {
    const words = Array.from(
      { length: MARKDOWN_TITLE_SOURCE_MAX_WORDS + 25 },
      (_, index) => `word-${index + 1}`,
    );

    const source = buildMarkdownTitleSource(words.join("\n\t"));

    expect(source?.split(/\s+/)).toHaveLength(MARKDOWN_TITLE_SOURCE_MAX_WORDS);
    expect(source).toContain("word-500");
    expect(source).not.toContain("word-501");
  });

  it("puts the first markdown heading ahead of the body", () => {
    const source = buildMarkdownTitleSource("# The Bridge\n\nKael waits in the rain.");

    expect(source?.startsWith("Heading: The Bridge\n\n")).toBe(true);
    expect(source).toContain("Kael waits in the rain.");
  });

  it("respects the shared source length limit and rejects empty content", () => {
    expect(buildMarkdownTitleSource("  \n\t ")).toBeNull();
    expect(buildMarkdownTitleSource("x".repeat(ITEM_TITLE_SOURCE_MAX_LENGTH + 100))).toHaveLength(
      ITEM_TITLE_SOURCE_MAX_LENGTH,
    );
  });
});
