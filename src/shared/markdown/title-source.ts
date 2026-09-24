export const ITEM_TITLE_SOURCE_MAX_LENGTH = 8_000;
export const MARKDOWN_TITLE_SOURCE_MAX_WORDS = 500;
export const DEFAULT_CHAT_TITLE = "New chat";
export const DEFAULT_MARKDOWN_TITLE = "New markdown";

const REPLACEABLE_ITEM_TITLES = new Set([DEFAULT_CHAT_TITLE, DEFAULT_MARKDOWN_TITLE, "Untitled"]);

export function isReplaceableItemTitle(title: string): boolean {
  const normalized = title.trim();
  return normalized.length === 0 || REPLACEABLE_ITEM_TITLES.has(normalized);
}

export function shouldCommitGeneratedTitle(
  mode: "auto" | "explicit",
  titleAtStart: string,
  titleNow: string,
): boolean {
  if (titleNow !== titleAtStart) return false;
  if (mode === "auto" && !isReplaceableItemTitle(titleNow)) return false;
  return true;
}

const MARKDOWN_HEADING = /^#{1,6}[ \t]+(.+)$/m;

export function buildMarkdownTitleSource(markdown: string): string | null {
  const trimmed = markdown.trim();
  if (!trimmed) return null;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const body = words
    .slice(0, MARKDOWN_TITLE_SOURCE_MAX_WORDS)
    .join(" ")
    .slice(0, ITEM_TITLE_SOURCE_MAX_LENGTH);
  const heading = trimmed.match(MARKDOWN_HEADING)?.[1]?.replace(/\s+/g, " ").trim();
  if (!heading) return body;

  return `Heading: ${heading}\n\n${body}`.slice(0, ITEM_TITLE_SOURCE_MAX_LENGTH);
}
