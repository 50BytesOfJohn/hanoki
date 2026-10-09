import type { Editor } from "@tiptap/core";

import { countPlainTextWords } from "@shared/markdown/word-count";

export function countEditorSelection(editor: Editor): number | null {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const chunks: string[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (node.type.name === "wikilink") {
      const alias = node.attrs.alias;
      const target = node.attrs.targetText;
      chunks.push(typeof alias === "string" && alias.length > 0 ? alias : String(target ?? ""));
      return false;
    }
    if (node.isText && node.text) {
      const start = Math.max(0, from - pos);
      const end = Math.min(node.text.length, to - pos);
      if (end > start) chunks.push(node.text.slice(start, end));
      return;
    }
    if (node.isBlock) chunks.push("\n");
  });
  return countPlainTextWords(chunks.join(""));
}
