import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

describe("Markdown document conversion", () => {
  it("parses and serializes the supported Markdown shape", () => {
    const manager = new MarkdownManager({ extensions: [StarterKit] });
    const source = "# Notes\n\nA **bold** point with a [link](https://hanoki.app).\n\n- One\n- Two";

    const document = manager.parse(source);
    const serialized = manager.serialize(document);

    expect(document.type).toBe("doc");
    expect(serialized).toContain("# Notes");
    expect(serialized).toContain("**bold**");
    expect(serialized).toContain("[link](https://hanoki.app)");
    expect(serialized).toContain("- One");
  });
});
