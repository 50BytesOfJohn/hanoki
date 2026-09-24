import { describe, expect, it } from "vitest";
import {
  buildMarkdownTitleSource,
  isReplaceableItemTitle,
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
  it("keeps H1–H3 and the first 100 words of the opening", () => {
    const words = Array.from(
      { length: MARKDOWN_TITLE_SOURCE_MAX_WORDS + 10 },
      (_, index) => `word-${index + 1}`,
    );
    const source = buildMarkdownTitleSource(
      `# The Bridge\n\n## Rain\n\n${words.join(" ")}\n\n#### Skip me\n\n\`\`\`ts\nconst hidden = true;\n\`\`\`\n\n![map](map.png)`,
    );

    expect(source).toContain("Headings:\n- The Bridge\n- Rain");
    expect(source).not.toContain("Skip me");
    expect(source).toContain("word-100");
    expect(source).not.toContain("word-101");
    expect(source).not.toContain("hidden");
    expect(source).not.toContain("map.png");
  });

  it("rejects empty content", () => {
    expect(buildMarkdownTitleSource("  \n\t ")).toBeNull();
    expect(buildMarkdownTitleSource("```\nonly code\n```")).toBeNull();
  });
});
