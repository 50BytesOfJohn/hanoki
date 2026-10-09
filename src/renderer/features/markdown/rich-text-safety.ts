import { MarkdownManager } from "@tiptap/markdown";
import { Marked, marked, type Token, type Tokens } from "marked";

import { splitFrontmatter } from "@shared/markdown/frontmatter";

import { RICH_TEXT_SCHEMA_EXTENSIONS } from "./rich-text-schema";
import { Wikilink } from "./wikilink-extension";

const compareMarked = freshMarked();

const manager = new MarkdownManager({
  extensions: [...RICH_TEXT_SCHEMA_EXTENSIONS, Wikilink],
  marked: freshMarked(),
});

function freshMarked(): typeof marked {
  const instance = new Marked();
  // SAFETY: MarkdownManager only calls lexer, parser, use, and setOptions, which Marked implements.
  return instance as unknown as typeof marked;
}

const FENCE = /^( {0,3})(`{3,}|~{3,})([^`~]*)$/;
const FOOTNOTE = /\[\^[^\]]+\]|\^\[[^\]]+\]/;
const MATH = /\$\$[\s\S]+?\$\$|(?<!\\)\$(?!\$)(?!\s)(?:\\.|[^$\n\\])+?(?<!\s)\$(?!\$)/;
const ORDERED_TASK = /^ {0,3}\d+[.)] \[[ xX]\]/;
const EMPTY_TASK = /^ {0,3}[-*+] \[[ xX]\]$/;
const NESTED_EMPTY_TASK = /^ {4,}[-*+] \[[ xX]\]$/;
const LIST_LINE = /^(?: {0,3}(?:[-*+]|\d+[.)]) | {4,}[-*+] )/;
const HASH_TAG = /#[A-Za-z0-9][A-Za-z0-9/_-]*_[A-Za-z0-9/_-]*/g;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const NAMED_ENTITY = /&(?!(?:amp|lt|gt|quot|apos);)[A-Za-z][A-Za-z0-9]+;/;
const AUTOLINK = /^<(?:[a-z][a-z0-9+.-]*:\/\/[^>\s]*|mailto:[^>\s]*|[^>\s@]+@[^>\s@]+)>$/i;
const HTML_TAGS = new Set(
  "a abbr address article aside audio b bdi bdo big blockquote br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li link main map mark math menu meta meter mi mn mo mfrac mrow msub msup nav nobr noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr".split(
    " ",
  ),
);
const WIKILINK = /(!?)\[\[([^\]\n]*)\]\]/g;
const ESCAPED_ORDERED_MARKER = /^ {0,3}\d+\\\./;

export interface RichTextInspection {
  losesContent: boolean;
  summary: string | null;
}

export const RICH_TEXT_CHECK_LIMIT = 200_000;

interface ScanHits {
  html: boolean;
  footnote: boolean;
  callout: boolean;
  math: boolean;
  reference: boolean;
  escapedList: boolean;
  tildeFence: boolean;
  orderedTask: boolean;
  tableLoss: boolean;
  toml: boolean;
  unknown: boolean;
  tableColumns?: number;
}

type Sem =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "em" | "strong" | "del"; c: Sem[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Sem[] }
  | { t: "image"; href: string; alt: string }
  | { t: "p" | "q"; c: Sem[] }
  | { t: "h"; d: number; c: Sem[] }
  | { t: "pre"; lang: string; text: string }
  | { t: "hr" }
  | { t: "def"; tag: string; href: string }
  | {
      t: "list";
      ordered: boolean;
      start: number;
      items: Array<{ checked: boolean | null; c: Sem[] }>;
    }
  | { t: "table"; align: Array<string | null>; header: Sem[][]; rows: Sem[][][] };

export function inspectRichText(markdown: string, serializedBody?: string): RichTextInspection {
  if (markdown.length > RICH_TEXT_CHECK_LIMIT) {
    return { losesContent: true, summary: null };
  }
  const body = splitFrontmatter(markdown).body;
  const tokens = lex(body);
  const hits = scan(body, tokens);
  let serialized = serializedBody ?? null;
  if (serializedBody === undefined) {
    try {
      serialized = manager.serialize(manager.parse(body));
    } catch {
      serialized = null;
    }
  }
  const losesContent =
    serialized === null || hasHit(hits) || !sameSemantics(body, tokens, serialized);
  return {
    losesContent,
    summary: losesContent ? lossSummary(hits) : null,
  };
}

export function richTextRoundTripLosesContent(source: string, serialized: string): boolean {
  const body = splitFrontmatter(source).body;
  const tokens = lex(body);
  if (hasHit(scan(body, tokens))) return true;
  return !sameSemantics(body, tokens, serialized);
}

function sameSemantics(source: string, sourceTokens: Token[], serialized: string): boolean {
  if (
    !sameWikilinks(source, serialized) ||
    lostObsidianEscape(source, serialized) ||
    lostClosingTag(source, serialized) ||
    lostHashTag(source, serialized) ||
    lostEmptyTask(source, serialized)
  ) {
    return false;
  }
  return JSON.stringify(blocks(sourceTokens)) === JSON.stringify(blocks(lex(serialized)));
}

function lostObsidianEscape(source: string, serialized: string): boolean {
  const before = stripCode(source);
  const after = stripCode(serialized);
  return (
    occurrences(before, /\\#/g) > occurrences(after, /\\#/g) ||
    occurrences(before, /\\!\[\[/g) > occurrences(after, /\\!\[\[/g)
  );
}

function lostClosingTag(source: string, serialized: string): boolean {
  for (const match of stripCode(source).matchAll(/<\/[A-Za-z][A-Za-z0-9-]*>/g)) {
    if (!serialized.includes(match[0] ?? "")) return true;
  }
  return false;
}

function lostHashTag(source: string, serialized: string): boolean {
  const tags = stripCode(source).match(HASH_TAG);
  if (!tags) return false;
  const after = stripCode(serialized);
  return tags.some((tag) => !after.includes(tag));
}

function lostEmptyTask(source: string, serialized: string): boolean {
  return countEmptyTasks(stripCode(source)) > countEmptyTasks(stripCode(serialized));
}

function countEmptyTasks(markdown: string): number {
  let count = 0;
  let previous = "";
  for (const line of markdown.split("\n")) {
    if (EMPTY_TASK.test(line) || (NESTED_EMPTY_TASK.test(line) && LIST_LINE.test(previous))) {
      count += 1;
    }
    if (line.trim() !== "") previous = line;
  }
  return count;
}

function occurrences(markdown: string, pattern: RegExp): number {
  return [...markdown.matchAll(pattern)].length;
}

function stripCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function markupText(tokens: Token[]): string {
  let text = "";
  for (const token of tokens) {
    if (token.type === "code" || token.type === "codespan") continue;
    if (token.type === "list" && isToken<Tokens.List>(token, "list")) {
      for (const item of token.items) text += markupText(item.tokens);
      continue;
    }
    if (token.type === "blockquote" && isToken<Tokens.Blockquote>(token, "blockquote")) {
      text += markupText(token.tokens);
      continue;
    }
    text += `${token.raw}\n`;
  }
  return text;
}

function sameWikilinks(source: string, serialized: string): boolean {
  return JSON.stringify(wikilinks(source)) === JSON.stringify(wikilinks(serialized));
}

function wikilinks(markdown: string) {
  const plain = stripCode(markdown);
  const refs: Array<{ embed: boolean; target: string; fragment: string; alias: string }> = [];
  for (const match of plain.matchAll(WIKILINK)) {
    const inner = match[2] ?? "";
    const bar = inner.indexOf("|");
    const head = (bar === -1 ? inner : inner.slice(0, bar)).trim();
    const alias = bar === -1 ? "" : inner.slice(bar + 1).trim();
    const hash = head.indexOf("#");
    refs.push({
      embed: match[1] === "!",
      target: (hash === -1 ? head : head.slice(0, hash)).trim(),
      fragment: hash === -1 ? "" : head.slice(hash + 1).trim(),
      alias,
    });
  }
  return refs;
}

function lex(markdown: string): Token[] {
  return compareMarked.lexer(markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
}

function scan(markdown: string, tokens: Token[]): ScanHits {
  const hits: ScanHits = {
    html: false,
    footnote: false,
    callout: false,
    math: false,
    reference: false,
    escapedList: false,
    tildeFence: tildeFenceContainsBacktickFence(markdown),
    orderedTask: false,
    tableLoss: false,
    toml: false,
    unknown: false,
  };
  const visible = stripCode(markupText(tokens));
  if (htmlIsLossy(visible) || NAMED_ENTITY.test(visible)) hits.html = true;
  scanLines(markdown, hits);
  scanTokens(tokens, hits);
  return hits;
}

function isToken<T extends Token>(token: Token, type: string): token is T {
  return token.type === type;
}

function scanTokens(tokens: Token[], hits: ScanHits) {
  for (const token of tokens) {
    switch (token.type) {
      case "space":
      case "code":
      case "hr":
        break;
      case "html":
        if (htmlIsLossy(token.raw)) hits.html = true;
        break;
      case "def":
        if (!isToken<Tokens.Def>(token, "def")) break;
        if (token.tag.startsWith("^")) hits.footnote = true;
        else hits.reference = true;
        break;
      case "blockquote":
        if (!isToken<Tokens.Blockquote>(token, "blockquote")) break;
        if (/^\[![^\]]+\]/.test(token.text.trimStart())) hits.callout = true;
        noteProse(visibleInline(token.tokens), hits);
        scanTokens(token.tokens, hits);
        break;
      case "list":
        if (!isToken<Tokens.List>(token, "list")) break;
        for (const item of token.items) {
          noteProse(visibleInline(item.tokens), hits);
          scanTokens(item.tokens, hits);
        }
        break;
      case "table":
        if (!isToken<Tokens.Table>(token, "table")) break;
        for (const cell of token.header) {
          noteProse(visibleInline(cell.tokens), hits);
          scanTokens(cell.tokens, hits);
        }
        for (const row of token.rows) {
          for (const cell of row) {
            noteProse(visibleInline(cell.tokens), hits);
            scanTokens(cell.tokens, hits);
          }
        }
        break;
      case "paragraph":
      case "heading":
      case "text":
        noteProse(visibleInline(token.tokens ?? [token]), hits);
        if (token.tokens) scanTokens(token.tokens, hits);
        break;
      case "checkbox":
      case "codespan":
      case "em":
      case "strong":
      case "del":
      case "link":
      case "image":
      case "br":
      case "escape":
        if ("tokens" in token && token.tokens) scanTokens(token.tokens, hits);
        break;
      default:
        hits.unknown = true;
        break;
    }
  }
}

function visibleInline(tokens: Token[] | undefined): string {
  let text = "";
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "codespan":
      case "code":
        break;
      case "text":
      case "escape":
        text += token.raw;
        break;
      case "html":
        text += token.raw;
        break;
      case "em":
      case "strong":
      case "del":
      case "link":
        text += visibleInline(token.tokens);
        break;
      default:
        break;
    }
  }
  return text;
}

function noteProse(text: string, hits: ScanHits) {
  if (FOOTNOTE.test(text)) hits.footnote = true;
  if (MATH.test(text)) hits.math = true;
  if (htmlIsLossy(text)) hits.html = true;
}

function htmlIsLossy(raw: string): boolean {
  if (/<!--[\s\S]*?-->/.test(raw) || /<!DOCTYPE\b/i.test(raw)) return true;
  if (/<\?/.test(raw) || /<!\[CDATA\[/i.test(raw)) return true;
  const tags = new RegExp("</?([A-Za-z][A-Za-z0-9-]*)([^<>]*)>", "g");
  for (const match of raw.matchAll(tags)) {
    if (AUTOLINK.test(match[0] ?? "")) continue;
    const name = (match[1] ?? "").toLowerCase();
    const rest = match[2] ?? "";
    if (
      HTML_TAGS.has(name) ||
      name.includes("-") ||
      rest.includes("=") ||
      rest.trim() === "" ||
      /\/\s*$/.test(rest)
    ) {
      return true;
    }
  }
  return false;
}

function scanLines(markdown: string, hits: ScanHits) {
  const lines = markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  let openChar = "";
  let openLength = 0;
  let previous = "";
  for (const line of lines) {
    const fence = FENCE.exec(line);
    const marker = fence?.[2] ?? "";
    if (openLength === 0) {
      if (fence) {
        openChar = marker[0] ?? "";
        openLength = marker.length;
        previous = "";
        hits.tableColumns = undefined;
        continue;
      }
      const visible = line.replace(/`+[^`]*`+/g, "");
      if (ESCAPED_ORDERED_MARKER.test(visible)) hits.escapedList = true;
      if (ORDERED_TASK.test(line)) hits.orderedTask = true;
      if (line.trim() === "+++") hits.toml = true;
      noteTable(line, previous, hits);
      previous = line;
      continue;
    }
    if (fence && marker[0] === openChar && marker.length >= openLength) {
      openChar = "";
      openLength = 0;
    }
  }
}

function tildeFenceContainsBacktickFence(markdown: string): boolean {
  const lines = markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  let openChar = "";
  let openLength = 0;
  for (const line of lines) {
    const fence = FENCE.exec(line);
    const marker = fence?.[2] ?? "";
    if (openLength === 0) {
      if (fence) {
        openChar = marker[0] ?? "";
        openLength = marker.length;
      }
      continue;
    }
    if (fence && marker[0] === openChar && marker.length >= openLength) {
      openChar = "";
      openLength = 0;
      continue;
    }
    if (openChar === "~" && fence && marker[0] === "`" && marker.length >= openLength) return true;
  }
  return false;
}

function noteTable(line: string, previous: string, hits: ScanHits) {
  if (isTableSeparator(line)) {
    const columns = separatorColumns(line);
    const headerCells = tableCellCount(previous);
    const plainHeader = previous.trim().length > 0 && headerCells === null;
    if (headerCells !== columns && !(plainHeader && columns === 1)) {
      hits.tableColumns = undefined;
      return;
    }
    hits.tableColumns = columns;
    if (line.includes("\\|") || previous.includes("\\|")) hits.tableLoss = true;
    return;
  }
  const piped = /^\s*\|/.test(line);
  if (!piped && hits.tableColumns === undefined) return;
  if (line.includes("\\|")) hits.tableLoss = true;
  const cells = tableCellCount(line);
  if (cells === null) {
    hits.tableColumns = undefined;
    return;
  }
  if (hits.tableColumns === undefined) {
    hits.tableColumns = cells;
    return;
  }
  if (cells > hits.tableColumns) hits.tableLoss = true;
}

function tableCellCount(line: string): number | null {
  if (!line.trim().includes("|")) return null;
  let code = false;
  const cells = [""];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (ch === "`") {
      code = !code;
      cells[cells.length - 1] += ch;
      continue;
    }
    if (ch === "\\" && !code) {
      cells[cells.length - 1] += ch + (line[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (ch === "|" && !code) {
      cells.push("");
      continue;
    }
    cells[cells.length - 1] += ch;
  }
  if (cells[0]?.trim() === "") cells.shift();
  if (cells.at(-1)?.trim() === "") cells.pop();
  if (cells.length > 1) return cells.length;
  if (cells.length === 1 && line.includes("|")) return 1;
  return null;
}

function isTableSeparator(line: string): boolean {
  if (!line.includes("|") && !line.includes(":")) return false;
  return TABLE_SEPARATOR.test(line);
}

function separatorColumns(line: string): number {
  const core = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return core.split("|").length;
}

function hasHit(hits: ScanHits): boolean {
  return (
    hits.html ||
    hits.footnote ||
    hits.callout ||
    hits.math ||
    hits.reference ||
    hits.escapedList ||
    hits.tildeFence ||
    hits.orderedTask ||
    hits.tableLoss ||
    hits.toml ||
    hits.unknown
  );
}

function lossSummary(hits: ScanHits): string | null {
  const found: string[] = [];
  if (hits.html) found.push("HTML");
  if (hits.footnote) found.push("a footnote");
  if (hits.callout) found.push("a callout");
  if (hits.math) found.push("math");
  if (hits.reference) found.push("a reference link");
  if (hits.escapedList) found.push("an escaped list marker");
  if (hits.tildeFence) found.push("a tilde fence");
  if (hits.orderedTask) found.push("an ordered task");
  if (hits.tableLoss) found.push("a table");
  if (hits.toml) found.push("TOML frontmatter");
  if (hits.unknown) found.push("unsupported formatting");
  if (found.length === 0) return null;
  if (found.length === 1) return `Has ${found[0]}.`;
  if (found.length === 2) return `Has ${found[0]} and ${found[1]}.`;
  return `Has ${found.slice(0, -1).join(", ")} and ${found[found.length - 1]}.`;
}

function blocks(tokens: Token[]): Sem[] {
  const out: Sem[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;
      case "paragraph":
        if (!isToken<Tokens.Paragraph>(token, "paragraph")) break;
        out.push({ t: "p", c: inline(token.tokens) });
        break;
      case "text":
        if (!isToken<Tokens.Text>(token, "text")) break;
        out.push({
          t: "p",
          c: token.tokens ? inline(token.tokens) : [{ t: "text", v: decode(token.text) }],
        });
        break;
      case "heading":
        if (!isToken<Tokens.Heading>(token, "heading")) break;
        out.push({ t: "h", d: token.depth, c: inline(token.tokens) });
        break;
      case "code":
        if (!isToken<Tokens.Code>(token, "code")) break;
        out.push({ t: "pre", lang: token.lang || "", text: token.text.replace(/\n$/, "") });
        break;
      case "blockquote":
        if (!isToken<Tokens.Blockquote>(token, "blockquote")) break;
        out.push({ t: "q", c: blocks(token.tokens) });
        break;
      case "hr":
        out.push({ t: "hr" });
        break;
      case "html":
        if (!isToken<Tokens.HTML>(token, "html")) break;
        out.push({ t: "p", c: [{ t: "text", v: htmlSemantic(token.raw, token.text).trimEnd() }] });
        break;
      case "def":
        if (!isToken<Tokens.Def>(token, "def")) break;
        out.push({ t: "def", tag: token.tag, href: token.href });
        break;
      case "list":
        if (!isToken<Tokens.List>(token, "list")) break;
        out.push({
          t: "list",
          ordered: token.ordered,
          start: token.ordered && token.start !== "" ? token.start : 0,
          items: token.items.map((item) => ({
            checked: item.task ? Boolean(item.checked) : null,
            c: blocks(item.tokens),
          })),
        });
        break;
      case "table":
        if (!isToken<Tokens.Table>(token, "table")) break;
        out.push({
          t: "table",
          align: token.align,
          header: token.header.map((cell) => inline(cell.tokens)),
          rows: token.rows.map((row) => row.map((cell) => inline(cell.tokens))),
        });
        break;
      default:
        break;
    }
  }
  return coalesceBulletLists(out);
}

function coalesceBulletLists(nodes: Sem[]): Sem[] {
  const out: Sem[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.t === "list" && prev?.t === "list" && !node.ordered && !prev.ordered) {
      prev.items.push(...node.items);
      continue;
    }
    out.push(node);
  }
  return out;
}

function inline(tokens: Token[]): Sem[] {
  const out: Sem[] = [];
  for (const token of tokens) appendInline(out, token);
  return out;
}

function appendInline(out: Sem[], token: Token) {
  switch (token.type) {
    case "text":
      pushText(out, decode(token.text));
      break;
    case "escape":
      pushText(out, token.text);
      break;
    case "br":
      out.push({ t: "br" });
      break;
    case "codespan":
      out.push({ t: "code", v: token.text });
      break;
    case "em":
    case "strong":
    case "del":
      if (
        !isToken<Tokens.Em>(token, "em") &&
        !isToken<Tokens.Strong>(token, "strong") &&
        !isToken<Tokens.Del>(token, "del")
      ) {
        break;
      }
      out.push({ t: token.type, c: inline(token.tokens) });
      break;
    case "link":
      if (!isToken<Tokens.Link>(token, "link")) break;
      out.push({ t: "link", href: token.href, c: inline(token.tokens) });
      break;
    case "image":
      out.push({ t: "image", href: token.href, alt: decode(token.text) });
      break;
    case "html":
      pushText(out, htmlSemantic(token.raw, token.text));
      break;
    default:
      break;
  }
}

function pushText(out: Sem[], value: string) {
  if (value.length === 0) return;
  const last = out[out.length - 1];
  if (last?.t === "text") last.v += value;
  else out.push({ t: "text", v: value });
}

function htmlSemantic(raw: string, text: string): string {
  if (/<[!?/A-Za-z]/.test(raw)) return raw;
  return decode(text);
}

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
