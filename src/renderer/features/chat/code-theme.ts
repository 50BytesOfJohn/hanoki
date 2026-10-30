import type { ThemeInput } from "@streamdown/code";

const color = (name: string) => `var(--code-${name})`;

const rule = (scope: string[], foreground: string, fontStyle?: string) => ({
  scope,
  settings: { foreground, ...(fontStyle ? { fontStyle } : {}) },
});

/**
 * Syntax colors for chat code blocks, as CSS variables so they stay in `index.css` with the rest
 * of the palette. Shiki passes non-hex values through to the rendered tokens unchanged.
 */
export const hanokiCodeTheme: ThemeInput = {
  name: "hanoki",
  type: "dark",
  // Matches the code block body behind the `pre`, so the block stays one flat surface.
  bg: "var(--background)",
  fg: color("foreground"),
  settings: [
    rule(["comment", "punctuation.definition.comment", "string.comment"], color("comment")),
    rule(
      [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "keyword.operator.new",
        "keyword.operator.expression",
        "entity.name.tag",
        "markup.heading",
      ],
      color("keyword"),
    ),
    rule(
      [
        "string",
        "string.regexp",
        "punctuation.definition.string",
        "markup.inline.raw",
        "markup.fenced_code",
      ],
      color("string"),
    ),
    rule(
      ["constant", "constant.numeric", "constant.language", "variable.other.enummember"],
      color("constant"),
    ),
    rule(["entity.name.function", "support.function", "meta.function-call"], color("function")),
    rule(
      [
        "entity.name.type",
        "entity.name.class",
        "entity.name.namespace",
        "entity.other.inherited-class",
        "entity.other.attribute-name",
        "support.type",
        "support.class",
      ],
      color("type"),
    ),
    rule(
      ["variable", "variable.parameter", "variable.other.property", "support.variable"],
      color("foreground"),
    ),
    rule(
      ["punctuation", "meta.brace", "keyword.operator", "meta.embedded.punctuation"],
      color("punctuation"),
    ),
    rule(["markup.inserted", "punctuation.definition.inserted"], color("inserted")),
    rule(["markup.deleted", "punctuation.definition.deleted"], color("deleted")),
    rule(["markup.bold"], color("foreground"), "bold"),
    rule(["markup.italic"], color("foreground"), "italic"),
    rule(["markup.underline.link", "string.other.link"], "var(--link)"),
    rule(["invalid", "invalid.illegal"], color("deleted")),
  ],
};
