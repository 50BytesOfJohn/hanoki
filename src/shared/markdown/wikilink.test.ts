import { describe, expect, it } from "vitest";

import {
  findWikilinks,
  formatWikilink,
  oldestByItemId,
  rewriteWikilinkTargets,
  wikilinkSnippet,
} from "./wikilink";

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

  it("picks the oldest item id and treats no match as unresolved", () => {
    expect(oldestByItemId([])).toBeNull();
    expect(
      oldestByItemId([
        { id: "0199ffff-0000-7000-8000-000000000002", createdAt: 1 },
        { id: "0199aaaa-0000-7000-8000-000000000001", createdAt: 9 },
      ])?.id,
    ).toBe("0199aaaa-0000-7000-8000-000000000001");
  });

  it("snippets the linking line without walking other notes", () => {
    const markdown = "Before\n\nThis mentions [[Alpha|the note]] in passing.\nAfter";
    expect(wikilinkSnippet(markdown, "Alpha")).toBe("This mentions the note in passing.");
  });
});
