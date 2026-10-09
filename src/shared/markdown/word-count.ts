const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const SEGMENTED_SCRIPT_RE = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const KEYCAP_RE = /[#*0-9]\uFE0F?\u20E3/gu;
const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/gu;
const NBSP_RE = /&nbsp;|&#0*160;|&#x0*a0;/gi;
const RAW_BLOCK_OPEN_RE = /<(script|style)\b[^>]*>/gi;
const FOOTNOTE_DEF_RE = /^ {0,3}\[\^[^\]]+\]:[ \t]?(.*)$/;
const FOOTNOTE_REF_RE = /\[\^[^\]]+\]/g;
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
const HTML_TAG_RE = /<\/?([A-Za-z][A-Za-z0-9-]*)([^>\n]*)>/g;
const HTML_TAG_NAMES = new Set([
  "a",
  "article",
  "b",
  "blockquote",
  "br",
  "button",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "script",
  "section",
  "span",
  "strong",
  "style",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);
const LIST_MARKER_RE = /^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const BLOCKQUOTE_RE = /^[ \t]{0,3}(?:>[ \t]?)+/;
const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+/;

let segmenter: Intl.Segmenter | undefined;

export function countPlainTextWords(text: string): number {
  let count = 0;
  const source = text.includes("&") ? text.replace(NBSP_RE, " ") : text;
  for (const token of source.split(/\s+/)) {
    if (token.length === 0) continue;
    const plain = token
      .replace(KEYCAP_RE, "")
      .replace(PICTOGRAPHIC_RE, "")
      .replace(/\uFE0F/gu, "");
    if (plain.length === 0) continue;
    if (SEGMENTED_SCRIPT_RE.test(token)) {
      segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
      for (const part of segmenter.segment(token)) {
        if (part.isWordLike) count += 1;
      }
      continue;
    }
    CJK_RE.lastIndex = 0;
    const cjk = plain.match(CJK_RE);
    CJK_RE.lastIndex = 0;
    if (cjk) {
      count += cjk.length;
      const rest = plain.replace(CJK_RE, " ");
      CJK_RE.lastIndex = 0;
      for (const piece of rest.split(" ")) {
        if (WORD_CHAR_RE.test(piece)) count += 1;
      }
      continue;
    }
    if (WORD_CHAR_RE.test(plain)) count += 1;
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
  let rawBlock: "script" | "style" | null = null;
  let count = 0;
  for (; index < lines.length; index += 1) {
    const line = stripBlockquote(lines[index] ?? "");
    if (fence) {
      const marker = FENCE_OPEN_RE.exec(line);
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
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }

    const unblocked = takeRawBlock(line, rawBlock);
    rawBlock = unblocked.rawBlock;
    if (unblocked.text.length === 0) continue;
    const visible = takeVisibleText(unblocked.text, inComment);
    inComment = visible.inComment;
    if (visible.text.length === 0) continue;
    const footnote = FOOTNOTE_DEF_RE.exec(visible.text);
    if (footnote) {
      count += countPlainTextWords(stripInline(footnote[1] ?? ""));
      continue;
    }
    if (REF_DEF_RE.test(visible.text) || TABLE_DELIM_RE.test(visible.text)) continue;
    count += countPlainTextWords(stripInline(visible.text));
  }
  return count;
}

function openingFence(line: string): string | null {
  const match = FENCE_OPEN_RE.exec(line);
  if (!match?.[1]) return null;
  const marker = match[1];
  const info = (match[2] ?? "").trim();
  if (marker.startsWith("`") && info.includes("`")) return null;
  return marker;
}

function stripBlockquote(line: string): string {
  let rest = line;
  while (rest.length > 0) {
    const match = /^ {0,3}> ?/.exec(rest);
    if (!match) return rest;
    rest = rest.slice(match[0].length);
  }
  return rest;
}

function takeRawBlock(
  line: string,
  rawBlock: "script" | "style" | null,
): { text: string; rawBlock: "script" | "style" | null } {
  let text = "";
  let cursor = 0;
  let mode = rawBlock;
  while (cursor < line.length) {
    if (mode) {
      const close = line.toLowerCase().indexOf(`</${mode}>`, cursor);
      if (close === -1) return { text, rawBlock: mode };
      cursor = close + mode.length + 3;
      mode = null;
      continue;
    }
    RAW_BLOCK_OPEN_RE.lastIndex = 0;
    const source = line.slice(cursor);
    const open = RAW_BLOCK_OPEN_RE.exec(source);
    if (!open?.[1]) {
      text += source;
      break;
    }
    text += source.slice(0, open.index);
    const name = open[1].toLowerCase() === "style" ? "style" : "script";
    const after = cursor + open.index + open[0].length;
    const close = line.toLowerCase().indexOf(`</${name}>`, after);
    if (close === -1) return { text, rawBlock: name };
    cursor = close + name.length + 3;
  }
  return { text, rawBlock: null };
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
  let text = line;
  if (text.includes("&")) {
    NBSP_RE.lastIndex = 0;
    text = text.replace(NBSP_RE, " ");
  }
  if (text.includes("`")) {
    INLINE_CODE_RE.lastIndex = 0;
    text = text.replace(INLINE_CODE_RE, (match) => match.replace(/`/g, ""));
  }
  if (text.includes("[") || text.includes("!")) {
    FOOTNOTE_REF_RE.lastIndex = 0;
    EMBED_RE.lastIndex = 0;
    WIKILINK_RE.lastIndex = 0;
    IMAGE_RE.lastIndex = 0;
    LINK_RE.lastIndex = 0;
    REF_LINK_RE.lastIndex = 0;
    text = text
      .replace(FOOTNOTE_REF_RE, " ")
      .replace(EMBED_RE, " ")
      .replace(WIKILINK_RE, (_raw, target: string, alias?: string) => ` ${alias ?? target} `)
      .replace(IMAGE_RE, " ")
      .replace(LINK_RE, " $1 ")
      .replace(REF_LINK_RE, " $1 ");
  }
  if (text.includes("<")) {
    AUTOLINK_RE.lastIndex = 0;
    HTML_TAG_RE.lastIndex = 0;
    text = text
      .replace(AUTOLINK_RE, " $1 ")
      .replace(HTML_TAG_RE, (raw, name: string, rest: string) => {
        if (/\s/.test(rest) && !HTML_TAG_NAMES.has(name.toLowerCase())) return raw;
        return " ";
      });
  }
  if (text.includes("|")) text = text.replace(/\|/g, " ");
  return text.replace(LIST_MARKER_RE, " ").replace(BLOCKQUOTE_RE, " ").replace(HEADING_RE, " ");
}
