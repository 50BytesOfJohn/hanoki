import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownToken } from "@tiptap/core";

import { formatWikilink } from "@shared/markdown/wikilink";

export interface WikilinkAttrs {
  targetText: string;
  alias: string | null;
}

const WIKILINK_INPUT = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?\]\]$/;

export const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  marks: "",

  addAttributes() {
    return {
      targetText: { default: "" },
      alias: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const target = typeof HTMLAttributes.targetText === "string" ? HTMLAttributes.targetText : "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-wikilink": "" }),
      typeof HTMLAttributes.alias === "string" && HTMLAttributes.alias.length > 0
        ? HTMLAttributes.alias
        : target,
    ];
  },

  markdownTokenName: "wikilink",

  markdownTokenizer: {
    name: "wikilink",
    level: "inline",
    start: "[[",
    tokenize(src) {
      const match = /^\[\[([^[\]\n]+?)\]\]/.exec(src);
      const inner = match?.[1];
      if (!match || !inner) return undefined;
      const pipe = inner.indexOf("|");
      const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
      const alias = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
      if (target.length === 0) return undefined;
      return {
        type: "wikilink",
        raw: match[0],
        target,
        alias: alias.length > 0 ? alias : null,
      };
    },
  },

  parseMarkdown(token: MarkdownToken) {
    const target = readTokenString(token, "target");
    const alias = readTokenString(token, "alias");
    return {
      type: "wikilink",
      attrs: {
        targetText: target,
        alias: alias.length > 0 ? alias : null,
      },
    };
  },

  renderMarkdown(node) {
    const attrs = node.attrs ?? {};
    const target = typeof attrs.targetText === "string" ? attrs.targetText : "";
    const alias = typeof attrs.alias === "string" ? attrs.alias : null;
    return formatWikilink(target, alias);
  },

  addInputRules() {
    return [
      new InputRule({
        find: WIKILINK_INPUT,
        handler: ({ range, match, chain }) => {
          const target = match[1]?.trim() ?? "";
          if (target.length === 0) return null;
          const alias = match[2]?.trim() ?? "";
          chain()
            .insertContentAt(range, {
              type: this.name,
              attrs: { targetText: target, alias: alias.length > 0 ? alias : null },
            })
            .run();
        },
      }),
    ];
  },
});

function readTokenString(token: MarkdownToken, key: string): string {
  if (!(key in token)) return "";
  const value = token[key];
  return typeof value === "string" ? value : "";
}
