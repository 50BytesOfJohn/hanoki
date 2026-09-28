import { describe, expect, it } from "vitest";

import { findWikilinks, formatWikilink, rewriteWikilinkTargets, wikilinkSnippet } from "./wikilink";

describe("wikilinks", () => {
  it("reads target and alias text", () => {
    expect(findWikilinks("See [[Alpha]] and [[Beta|alias]].")).toEqual([
      {
        start: 4,
        end: 13,
        target: "Alpha",
        alias: null,
        raw: "[[Alpha]]",
      },
      {
        start: 18,
        end: 32,
        target: "Beta",
        alias: "alias",
        raw: "[[Beta|alias]]",
      },
    ]);
    expect(formatWikilink("Alpha", null)).toBe("[[Alpha]]");
    expect(formatWikilink(" Beta ", " shown ")).toBe("[[Beta|shown]]");
  });

  it("skips fenced code, inline code, and escapes", () => {
    const markdown = [
      "Keep [[Real]].",
      "```",
      "[[Skip]]",
      "```",
      "Also `[[Skip]]` and \\[[Skip]] and [[Real|shown]].",
    ].join("\n");
    expect(findWikilinks(markdown).map((link) => link.raw)).toEqual(["[[Real]]", "[[Real|shown]]"]);
  });

  it("rewrites only the renamed target and keeps aliases", () => {
    const markdown = "[[Old]]\n\n```\n[[Old]]\n```\n\n[[Old|pet]] and [[Other]]";
    expect(rewriteWikilinkTargets(markdown, "old", "New")).toBe(
      "[[New]]\n\n```\n[[Old]]\n```\n\n[[New|pet]] and [[Other]]",
    );
    expect(rewriteWikilinkTargets(markdown, "Missing", "New")).toBe(markdown);
  });

  it("snippets the linking line without walking other notes", () => {
    const markdown = "Before\n\nThis mentions [[Alpha|the note]] in passing.\nAfter";
    expect(wikilinkSnippet(markdown, "Alpha")).toBe("This mentions the note in passing.");
  });
});
