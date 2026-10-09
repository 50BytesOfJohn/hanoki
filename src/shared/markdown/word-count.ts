const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const SEGMENTED_SCRIPT_RE = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const FRONTMATTER_OPEN_RE = /^---[ \t]*$/;
const FRONTMATTER_CLOSE_RE = /^(?:---|\.\.\.)[ \t]*$/;
const REF_DEF_RE = /^ {0,3}\[[^\]]+\]:[ \t]/;
const TABLE_DELIM_RE = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;
const INLINE_CODE_RE = /`+[^`\n]*`+/g;
const EMBED_RE = /!\[\[[^\]]*\]\]/g;
const WIKILINK_RE = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
const REF_LINK_RE = /\[([^\]]*)\]\[[^\]]*\]/g;
const AUTOLINK_RE = /<(https?:\/\/[^>\s]+)>/gi;
const HTML_TAG_RE = /<\/?[A-Za-z][^>]*>/g;
const LIST_MARKER_RE = /^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const BLOCKQUOTE_RE = /^[ \t]{0,3}(?:>[ \t]?)+/;
const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+/;

let segmenter: Intl.Segmenter | undefined;

export function countPlainTextWords(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (token.length === 0) continue;
    if (SEGMENTED_SCRIPT_RE.test(token)) {
      segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
      for (const part of segmenter.segment(token)) {
        if (part.isWordLike) count += 1;
      }
      continue;
    }
    CJK_RE.lastIndex = 0;
    const cjk = token.match(CJK_RE);
    CJK_RE.lastIndex = 0;
    if (cjk) {
      count += cjk.length;
      const rest = token.replace(CJK_RE, " ");
      CJK_RE.lastIndex = 0;
      for (const piece of rest.split(" ")) {
        if (WORD_CHAR_RE.test(piece)) count += 1;
      }
      continue;
    }
    if (WORD_CHAR_RE.test(token)) count += 1;
  }
  return count;
}

export function countMarkdownWords(markdown: string, options?: { frontmatter?: boolean }): number {
  const skipFrontmatter = options?.frontmatter !== false;
  let source = markdown;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  const lines = source.split(/\r?\n/);
  let index = 0;
  if (skipFrontmatter && FRONTMATTER_OPEN_RE.test(lines[0] ?? "")) {
    const end = lines.findIndex(
      (line, lineIndex) => lineIndex > 0 && FRONTMATTER_CLOSE_RE.test(line),
    );
    if (end > 0) index = end + 1;
  }

  let fence: string | null = null;
  let inComment = false;
  let count = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      const marker = FENCE_RE.exec(line);
      if (
        marker?.[1] &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        line.trim() === marker[1]
      ) {
        fence = null;
      }
      continue;
    }
    const opening = FENCE_RE.exec(line);
    if (opening?.[1]) {
      fence = opening[1];
      continue;
    }

    const visible = takeVisibleText(line, inComment);
    inComment = visible.inComment;
    if (visible.text.length === 0) continue;
    if (REF_DEF_RE.test(visible.text) || TABLE_DELIM_RE.test(visible.text)) continue;
    count += countPlainTextWords(stripInline(visible.text));
  }
  return count;
}

function takeVisibleText(line: string, inComment: boolean): { text: string; inComment: boolean } {
  let text = "";
  let cursor = 0;
  if (inComment) {
    const close = line.indexOf("-->");
    if (close === -1) return { text: "", inComment: true };
    cursor = close + 3;
  }
  while (cursor < line.length) {
    const start = line.indexOf("<!--", cursor);
    if (start === -1) {
      text += line.slice(cursor);
      return { text, inComment: false };
    }
    text += line.slice(cursor, start);
    const close = line.indexOf("-->", start + 4);
    if (close === -1) return { text, inComment: true };
    cursor = close + 3;
  }
  return { text, inComment: false };
}

function stripInline(line: string): string {
  INLINE_CODE_RE.lastIndex = 0;
  EMBED_RE.lastIndex = 0;
  WIKILINK_RE.lastIndex = 0;
  IMAGE_RE.lastIndex = 0;
  LINK_RE.lastIndex = 0;
  REF_LINK_RE.lastIndex = 0;
  AUTOLINK_RE.lastIndex = 0;
  HTML_TAG_RE.lastIndex = 0;
  return line
    .replace(INLINE_CODE_RE, (match) => match.replace(/`/g, ""))
    .replace(EMBED_RE, " ")
    .replace(WIKILINK_RE, (_raw, target: string, alias?: string) => ` ${alias ?? target} `)
    .replace(IMAGE_RE, " ")
    .replace(LINK_RE, " $1 ")
    .replace(REF_LINK_RE, " $1 ")
    .replace(AUTOLINK_RE, " $1 ")
    .replace(HTML_TAG_RE, " ")
    .replace(LIST_MARKER_RE, " ")
    .replace(BLOCKQUOTE_RE, " ")
    .replace(HEADING_RE, " ")
    .replace(/\|/g, " ");
}
