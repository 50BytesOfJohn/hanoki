import { createCodePlugin, type HighlightResult } from "@streamdown/code";
import { describe, expect, it } from "vitest";

import { hanokiCodeTheme } from "./code-theme";

const plugin = createCodePlugin({ themes: [hanokiCodeTheme, hanokiCodeTheme] });

function highlight(code: string, language: "tsx" | "python" | "diff") {
  return new Promise<HighlightResult>((resolve) => {
    plugin.highlight({ code, language, themes: plugin.getThemes() }, resolve);
  });
}

async function tokenColor(result: Promise<HighlightResult>, content: string) {
  const token = (await result).tokens.flat().find((t) => t.content.trim() === content);
  return token?.htmlStyle?.color;
}

describe("hanokiCodeTheme", () => {
  it("renders tokens as design system variables", async () => {
    const source = `// note
export function greet(name: string) {
  return "hi" + 1;
}`;
    const result = highlight(source, "tsx");

    expect(await tokenColor(result, "// note")).toBe("var(--code-comment)");
    expect(await tokenColor(result, "export")).toBe("var(--code-keyword)");
    expect(await tokenColor(result, "greet")).toBe("var(--code-function)");
    expect(await tokenColor(result, "string")).toBe("var(--code-type)");
    expect(await tokenColor(result, "1")).toBe("var(--code-constant)");
  });

  it("highlights other grammars and exposes the themed background", async () => {
    const result = await highlight("def f():\n    return 'x'\n", "python");

    expect(result.bg).toContain("var(--background)");
    expect(result.tokens.flat().map((t) => t.htmlStyle?.color)).toContain("var(--code-keyword)");
  });

  it("colors diff additions and removals", async () => {
    const result = highlight("- old\n+ new\n", "diff");

    expect(await tokenColor(result, "- old")).toBe("var(--code-deleted)");
    expect(await tokenColor(result, "+ new")).toBe("var(--code-inserted)");
  });
});
