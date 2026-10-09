import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

import { Wikilink } from "./wikilink-extension";

const manager = new MarkdownManager({
  extensions: [StarterKit, Wikilink],
});

const THEMATIC_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})([^`~]*)$/;
const BULLET = /^((?:>[ \t]*)*)([ \t]*)[*+]([ \t]+\S?)/;

export interface RichTextInspection {
  losesContent: boolean;
  summary: string | null;
}

/**
 * Parse with the editor's Markdown handlers and serialize back.
 * Formatting-only spelling (markers, fences, rules, emphasis, autolinks,
 * setext headings, line endings) is canonicalized before the compare.
 */
const HTML_MARKUP =
  /<!--[\s\S]*?-->|<!DOCTYPE\b[^>]*>|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*?)?\s*\/?>/i;
const ANY_IMAGE = /!\[[^\]\n]*\](?:\([^)\n]*\)|\[[^\]\n]*\])/;

export function inspectRichText(markdown: string): RichTextInspection {
  let serialized: string | null = null;
  try {
    serialized = manager.serialize(manager.parse(markdown));
  } catch {
    serialized = null;
  }
  const losesContent = serialized === null || richTextRoundTripLosesContent(markdown, serialized);
  return {
    losesContent,
    summary: losesContent ? lossSummary(markdown) : null,
  };
}

/** True when `serialized` dropped content from `source`, including both HTML outcomes. */
export function richTextRoundTripLosesContent(source: string, serialized: string): boolean {
  if (containsHtmlOrImage(source)) return true;
  return canonicalizeMarkdown(source) !== canonicalizeMarkdown(serialized);
}

function containsHtmlOrImage(markdown: string): boolean {
  const visible = stripCode(markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
  return HTML_MARKUP.test(visible) || ANY_IMAGE.test(visible);
}

function canonicalizeMarkdown(markdown: string): string {
  const text = markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trimEnd();
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = FENCE.exec(line);
    if (fence && !inFence) {
      inFence = true;
      fenceChar = (fence[2] ?? "`")[0] ?? "`";
      out.push(`${fence[1] ?? ""}${"`".repeat((fence[2] ?? "").length)}${fence[3] ?? ""}`);
      continue;
    }
    if (fence && inFence && (fence[2] ?? "")[0] === fenceChar) {
      inFence = false;
      out.push(`${fence[1] ?? ""}${"`".repeat((fence[2] ?? "").length)}`);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const next = lines[index + 1];
    if (next !== undefined && isSetextUnderline(next) && isSetextTitle(line)) {
      const level = next.trim().startsWith("=") ? "#" : "##";
      out.push(`${level} ${line.trim()}`);
      index += 1;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      out.push("---");
      continue;
    }
    out.push(canonicalizeInline(line.replace(BULLET, "$1$2-$3")));
  }

  return out.join("\n").trimEnd();
}

function isSetextUnderline(line: string): boolean {
  const match = SETEXT_UNDERLINE.exec(line);
  return Boolean(match) && (match?.[1]?.length ?? 0) >= 3;
}

function isSetextTitle(line: string): boolean {
  if (line.trim().length === 0) return false;
  if (/^ {0,3}(?:[-*+]\s|\d+[.)]\s|>|#{1,6}\s)/.test(line)) return false;
  if (THEMATIC_BREAK.test(line)) return false;
  return true;
}

function canonicalizeInline(line: string): string {
  const parts = line.split(/(`+[^`]*`+)/g);
  return parts
    .map((part, index) => (index % 2 === 1 && part.startsWith("`") ? part : canonicalizeText(part)))
    .join("");
}

function canonicalizeText(text: string): string {
  const held: string[] = [];
  const shielded = text.replace(
    /<(?:https?:\/\/|mailto:)[^>\s]+>|https?:\/\/[^\s<]+|www\.[^\s<]+|<[^\s@>]+@[^\s@>]+\.[^\s@>]+>/gi,
    (match) => {
      held.push(match);
      return `\uE000${held.length - 1}\uE000`;
    },
  );
  const emphasized = shielded
    .replace(/(?<!\\)(?<![\w*])__(.+?)__(?![\w*])/g, "**$1**")
    .replace(/(?<!\\)(?<![\w*])_([^_\n]+)_(?![\w*])/g, "*$1*");
  const restored = emphasized.replace(
    /\uE000(\d+)\uE000/g,
    (_match, index: string) => held[Number(index)] ?? "",
  );
  return canonicalizeAutolinks(restored);
}

function canonicalizeAutolinks(text: string): string {
  return text
    .replace(/<(https?:\/\/[^>\s]+)>/gi, "[$1]($1)")
    .replace(/<mailto:([^>\s]+)>/gi, "[$1](mailto:$1)")
    .replace(/<([^\s@>]+@[^\s@>]+\.[^\s@>]+)>/g, "[$1](mailto:$1)")
    .replace(/(^|[\s])(https?:\/\/[^\s<]+)/gi, (_match, prefix: string, url: string) => {
      const [core, trailing] = splitTrailingPunctuation(url);
      return `${prefix}[${core}](${core})${trailing}`;
    })
    .replace(/(^|[\s])(www\.[^\s<]+)/gi, (_match, prefix: string, url: string) => {
      const [core, trailing] = splitTrailingPunctuation(url);
      return `${prefix}[${core}](http://${core})${trailing}`;
    });
}

function splitTrailingPunctuation(url: string): [string, string] {
  const match = /^(.*?)([),.;:!?]*)$/.exec(url);
  return [match?.[1] ?? url, match?.[2] ?? ""];
}

function lossSummary(markdown: string): string | null {
  const source = stripCode(markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
  const found: string[] = [];
  if (hasFrontmatter(source)) found.push("frontmatter");
  if (/^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(source)) {
    found.push("a table");
  }
  if (/^ {0,3}[-*+] \[[ xX]\]/m.test(source)) found.push("task boxes");
  if (/\[\^[^\]]+\]/.test(source)) found.push("a footnote");
  if (HTML_MARKUP.test(source)) found.push("HTML");
  if (/^ {0,3}> ?\[![^\]]+\]/m.test(source)) found.push("a callout");
  if (ANY_IMAGE.test(source)) found.push("an image");
  if (/^ {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*\S/m.test(source)) found.push("a reference link");
  if (/(^|\s)\d+\\\./.test(source)) found.push("an escaped list marker");
  if (found.length === 0) return null;
  if (found.length === 1) return `Has ${found[0]}.`;
  if (found.length === 2) return `Has ${found[0]} and ${found[1]}.`;
  return `Has ${found.slice(0, -1).join(", ")} and ${found[found.length - 1]}.`;
}

function hasFrontmatter(markdown: string): boolean {
  return /^(---|\.\.\.)[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.test(markdown);
}

function stripCode(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]+`/g, "");
}
