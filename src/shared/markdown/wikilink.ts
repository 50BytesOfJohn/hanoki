export interface WikilinkMatch {
  start: number;
  end: number;
  target: string;
  alias: string | null;
  raw: string;
}

const FENCE = /^( {0,3})(`{3,}|~{3,})/;

export function normalizeWikilinkTitle(value: string): string {
  return value.trim().toLowerCase();
}

/** Raw `[[Title]]` stores no item id. Among title matches, the oldest item id wins. No match stays unresolved. */
export function oldestByItemId<T extends { id: string }>(matches: readonly T[]): T | null {
  let oldest: T | null = null;
  for (const match of matches) {
    if (!oldest || match.id < oldest.id) oldest = match;
  }
  return oldest;
}

/** Heading or block ref after the first `#`. The lookup text stays in front of it. */
export function splitWikilinkFragment(target: string): { lookup: string; fragment: string } {
  const hash = target.indexOf("#");
  if (hash === -1) return { lookup: target.trim(), fragment: "" };
  return { lookup: target.slice(0, hash).trim(), fragment: target.slice(hash) };
}

export function matchOutgoingLink<T extends { targetText: string; alias: string }>(
  edges: readonly T[] | undefined,
  targetText: string,
  alias: string | null,
): T | null {
  if (!edges) return null;
  const target = targetText.trim();
  const wanted = alias?.trim() ?? "";
  for (const edge of edges) {
    if (edge.targetText === target && edge.alias === wanted) return edge;
  }
  return null;
}

export function formatWikilink(target: string, alias: string | null): string {
  const trimmedTarget = target.trim();
  const trimmedAlias = alias?.trim() ?? "";
  if (trimmedAlias.length > 0) return `[[${trimmedTarget}|${trimmedAlias}]]`;
  return `[[${trimmedTarget}]]`;
}

/**
 * Obsidian-shaped `[[target]]` / `[[target|alias]]` outside fenced and inline code.
 * The stored text stays the title (or path text). Ids never enter the markdown.
 */
export function findWikilinks(markdown: string): WikilinkMatch[] {
  const matches: WikilinkMatch[] = [];
  let index = 0;
  let fenceMarker: string | null = null;

  while (index < markdown.length) {
    const lineStart = index === 0 || markdown[index - 1] === "\n";
    if (fenceMarker) {
      if (lineStart && lineClosesFence(markdown, index, fenceMarker)) {
        fenceMarker = null;
      }
      index = nextLine(markdown, index);
      continue;
    }

    if (lineStart) {
      const fence = readOpeningFence(markdown, index);
      if (fence) {
        fenceMarker = fence;
        index = nextLine(markdown, index);
        continue;
      }
    }

    const char = markdown[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "`") {
      const ticks = countRun(markdown, index, "`");
      const closer = markdown.indexOf("`".repeat(ticks), index + ticks);
      index = closer === -1 ? markdown.length : closer + ticks;
      continue;
    }

    if (markdown.startsWith("[[", index)) {
      const link = readWikilink(markdown, index);
      if (link) {
        matches.push(link);
        index = link.end;
        continue;
      }
    }

    index += 1;
  }

  return matches;
}

export function rewriteWikilinkTargets(
  markdown: string,
  fromTitle: string,
  toTitle: string,
  edges?: readonly { targetText: string; alias: string }[],
): string {
  const fromKey = normalizeWikilinkTitle(fromTitle);
  if (fromKey.length === 0) return markdown;
  const links = findWikilinks(markdown);
  if (links.length === 0) return markdown;
  const edgeKeys =
    edges === undefined
      ? null
      : new Set(edges.map((edge) => `${edge.targetText.trim()}\0${edge.alias.trim()}`));

  let next = "";
  let cursor = 0;
  let changed = false;
  for (const link of links) {
    next += markdown.slice(cursor, link.start);
    const target = link.target.trim();
    const alias = link.alias?.trim() ?? "";
    const parts = splitWikilinkFragment(target);
    const selected = edgeKeys === null || edgeKeys.has(`${target}\0${alias}`);
    const wholeTarget = normalizeWikilinkTitle(target) === fromKey;
    const titlePart = normalizeWikilinkTitle(parts.lookup) === fromKey;
    if (selected && (wholeTarget || titlePart)) {
      const replacement = wholeTarget ? toTitle.trim() : `${toTitle.trim()}${parts.fragment}`;
      next += formatWikilink(replacement, link.alias);
      changed = true;
    } else {
      next += link.raw;
    }
    cursor = link.end;
  }
  if (!changed) return markdown;
  next += markdown.slice(cursor);
  return next;
}

export function wikilinkSnippet(markdown: string, target: string): string {
  const key = normalizeWikilinkTitle(target);
  const link = findWikilinks(markdown).find(
    (candidate) => normalizeWikilinkTitle(candidate.target) === key,
  );
  if (!link) return "";

  const lineStart = markdown.lastIndexOf("\n", link.start) + 1;
  const lineEndIndex = markdown.indexOf("\n", link.end);
  const lineEnd = lineEndIndex === -1 ? markdown.length : lineEndIndex;
  const line = markdown.slice(lineStart, lineEnd);
  const readable = line
    .replace(/\[\[([^[\]\n]+?)\]\]/g, (_raw, inner: string) => {
      const pipe = inner.indexOf("|");
      const alias = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
      const title = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
      return alias.length > 0 ? alias : title;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (readable.length <= 140) return readable;
  return `${readable.slice(0, 139).trimEnd()}…`;
}

function readWikilink(markdown: string, start: number): WikilinkMatch | null {
  const close = markdown.indexOf("]]", start + 2);
  if (close === -1) return null;
  const newline = markdown.indexOf("\n", start + 2);
  if (newline !== -1 && newline < close) return null;
  const inner = markdown.slice(start + 2, close);
  if (inner.includes("[") || inner.includes("]")) return null;
  const pipe = inner.indexOf("|");
  const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
  if (target.length === 0) return null;
  return {
    start,
    end: close + 2,
    target,
    alias: alias.length > 0 ? alias : null,
    raw: markdown.slice(start, close + 2),
  };
}

function readOpeningFence(markdown: string, index: number): string | null {
  const lineEnd = markdown.indexOf("\n", index);
  const line = markdown.slice(index, lineEnd === -1 ? markdown.length : lineEnd);
  const match = FENCE.exec(line);
  if (!match?.[2]) return null;
  return match[2];
}

function lineClosesFence(markdown: string, index: number, marker: string): boolean {
  const lineEnd = markdown.indexOf("\n", index);
  const line = markdown.slice(index, lineEnd === -1 ? markdown.length : lineEnd);
  const match = FENCE.exec(line);
  if (!match?.[2]) return false;
  return match[2][0] === marker[0] && match[2].length >= marker.length && line.trim() === match[2];
}

function nextLine(markdown: string, index: number): number {
  const lineEnd = markdown.indexOf("\n", index);
  return lineEnd === -1 ? markdown.length : lineEnd + 1;
}

function countRun(value: string, index: number, char: string): number {
  let count = 0;
  while (value[index + count] === char) count += 1;
  return count;
}
