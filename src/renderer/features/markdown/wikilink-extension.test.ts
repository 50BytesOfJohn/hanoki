import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { Wikilink } from "./wikilink-extension";

const manager = new MarkdownManager({
  extensions: [StarterKit, Wikilink],
});

describe("wikilink markdown", () => {
  it("round-trips [[target]] and [[target|alias]] and leaves code literal", () => {
    const markdown = "See [[Alpha]] and [[Beta|alias]].\n\n```\n[[Skip]]\n```\n\n`[[Skip]]`\n";
    const parsed = manager.parse(markdown);
    const nodes = collect(parsed, "wikilink");

    expect(nodes.map((node) => node.attrs)).toEqual([
      { targetText: "Alpha", alias: null },
      { targetText: "Beta", alias: "alias" },
    ]);

    const serialized = manager.serialize(parsed);
    expect(serialized).toContain("[[Alpha]]");
    expect(serialized).toContain("[[Beta|alias]]");
    expect(serialized).toContain("[[Skip]]");
    expect(serialized).not.toContain("targetText");
  });
});

function collect(
  node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] },
  type: string,
): { type?: string; attrs?: Record<string, unknown> }[] {
  const found = node.type === type ? [node] : [];
  const children = Array.isArray(node.content) ? node.content : [];
  return found.concat(
    children.flatMap((child) =>
      child && typeof child === "object" ? collect(child as typeof node, type) : [],
    ),
  );
}
