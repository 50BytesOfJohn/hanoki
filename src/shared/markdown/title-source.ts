export const ITEM_TITLE_SOURCE_MAX_LENGTH = 8_000;
export const MARKDOWN_TITLE_SOURCE_MAX_WORDS = 500;
export const DEFAULT_MARKDOWN_TITLE = "New markdown";

export function buildMarkdownTitleSource(markdown: string): string | null {
  const words = markdown.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words
    .slice(0, MARKDOWN_TITLE_SOURCE_MAX_WORDS)
    .join(" ")
    .slice(0, ITEM_TITLE_SOURCE_MAX_LENGTH);
}
