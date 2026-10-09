import { MarkdownManager } from "@tiptap/markdown";
import { lexer, type Token, type Tokens } from "marked";

import { splitFrontmatter } from "@shared/markdown/frontmatter";

import { RICH_TEXT_SCHEMA_EXTENSIONS } from "./rich-text-schema";
import { Wikilink } from "./wikilink-extension";

const manager = new MarkdownManager({
  extensions: [...RICH_TEXT_SCHEMA_EXTENSIONS, Wikilink],
});

const HTML_TAGS = new Set(
  "a abbr address article aside audio b bdi bdo big blockquote br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li link main map mark math menu meta meter mi mn mo mfrac mrow msub msup nav nobr noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr".split(
    " ",
  ),
);

const FENCE = /^( {0,3})(`{3,}|~{3,})([^`~]*)$/;
const FOOTNOTE = /\[\^[^\]]+\]|\^\[[^\]]+\]/;
const MATH = /\$\$[\s\S]+?\$\$|(?<!\\)\$(?!\$)(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$(?!\$)/;
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

export function inspectRichText(markdown: string): RichTextInspection {
  if (markdown.length > RICH_TEXT_CHECK_LIMIT) {
    return { losesContent: true, summary: null };
  }
  const body = splitFrontmatter(markdown).body;
  const hits = scan(body);
  let serialized: string | null = null;
  try {
    serialized = manager.serialize(manager.parse(body));
  } catch {
    serialized = null;
  }
  const losesContent = serialized === null || hasHit(hits) || !sameSemantics(body, serialized);
  return {
    losesContent,
    summary: losesContent ? lossSummary(hits) : null,
  };
}

export function richTextRoundTripLosesContent(source: string, serialized: string): boolean {
  const body = splitFrontmatter(source).body;
  if (hasHit(scan(body))) return true;
  return !sameSemantics(body, serialized);
}

function sameSemantics(source: string, serialized: string): boolean {
  return JSON.stringify(blocks(lex(source))) === JSON.stringify(blocks(lex(serialized)));
}

function lex(markdown: string): Token[] {
  return lexer(markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
}

function scan(markdown: string): ScanHits {
  const hits: ScanHits = {
    html: false,
    footnote: false,
    callout: false,
    math: false,
    reference: false,
    escapedList: false,
    tildeFence: tildeFenceContainsBacktickFence(markdown),
  };
  scanLines(markdown, hits);
  scanTokens(lex(markdown), hits);
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
        for (const cell of token.header) noteProse(visibleInline(cell.tokens), hits);
        for (const row of token.rows) {
          for (const cell of row) noteProse(visibleInline(cell.tokens), hits);
        }
        break;
      case "paragraph":
      case "heading":
      case "text":
        noteProse(visibleInline(token.tokens ?? [token]), hits);
        break;
      default:
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
  const tags = new RegExp("</?([A-Za-z][A-Za-z0-9-]*)\\b([^<>]*)>", "g");
  for (const match of raw.matchAll(tags)) {
    const name = (match[1] ?? "").toLowerCase();
    const attrs = match[2] ?? "";
    if (attrs.includes("=") || HTML_TAGS.has(name)) return true;
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
  for (const line of lines) {
    const fence = FENCE.exec(line);
    const marker = fence?.[2] ?? "";
    if (openLength === 0) {
      if (fence) {
        openChar = marker[0] ?? "";
        openLength = marker.length;
        continue;
      }
      const visible = line.replace(/`+[^`]*`+/g, "");
      if (ESCAPED_ORDERED_MARKER.test(visible)) hits.escapedList = true;
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

function hasHit(hits: ScanHits): boolean {
  return (
    hits.html ||
    hits.footnote ||
    hits.callout ||
    hits.math ||
    hits.reference ||
    hits.escapedList ||
    hits.tildeFence
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
        out.push({ t: "p", c: [{ t: "text", v: decode(token.text).trimEnd() }] });
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
      pushText(out, decode(token.text));
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
