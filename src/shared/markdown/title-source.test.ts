import { describe, expect, it } from "vitest";
import {
  buildMarkdownTitleSource,
  ITEM_TITLE_SOURCE_MAX_LENGTH,
  MARKDOWN_TITLE_SOURCE_MAX_WORDS,
} from "./title-source";

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

  it("respects the shared source length limit and rejects empty content", () => {
    expect(buildMarkdownTitleSource("  \n\t ")).toBeNull();
    expect(buildMarkdownTitleSource("x".repeat(ITEM_TITLE_SOURCE_MAX_LENGTH + 100))).toHaveLength(
      ITEM_TITLE_SOURCE_MAX_LENGTH,
    );
  });
});
