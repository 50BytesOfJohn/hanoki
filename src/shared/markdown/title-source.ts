export const ITEM_TITLE_SOURCE_MAX_LENGTH = 8_000;
export const MARKDOWN_TITLE_SOURCE_MAX_WORDS = 500;
export const DEFAULT_MARKDOWN_TITLE = "New markdown";

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
