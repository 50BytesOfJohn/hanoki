export const MARKDOWN_TITLE_SOURCE_MAX_WORDS = 100;
export const DEFAULT_CHAT_TITLE = "New chat";
export const DEFAULT_MARKDOWN_TITLE = "New markdown";

const REPLACEABLE_ITEM_TITLES = new Set([DEFAULT_CHAT_TITLE, DEFAULT_MARKDOWN_TITLE, "Untitled"]);
const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const UNCLOSED_FENCE = /```[\s\S]*$|~~~[\s\S]*$/g;
const MARKDOWN_IMAGE = /!\[[^\]]*]\([^)]*\)/g;
const EMBED =
  /<(?:iframe|video|audio|embed|object|img)\b[^>]*>[\s\S]*?<\/(?:iframe|video|audio|embed|object)>|<(?:iframe|video|audio|embed|object|img)\b[^>]*\/?>/gi;
const H1_TO_H3 = /^(#{1,3})[ \t]+(.+)$/gm;

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

export function buildMarkdownTitleSource(markdown: string): string | null {
  const stripped = markdown
    .replace(FENCED_CODE, " ")
    .replace(UNCLOSED_FENCE, " ")
    .replace(MARKDOWN_IMAGE, " ")
    .replace(EMBED, " ");
  const headings: string[] = [];
  const withoutHeadings = stripped.replace(H1_TO_H3, (_match, _marks: string, text: string) => {
    const heading = text.replace(/\s+/g, " ").trim();
    if (heading) headings.push(heading);
    return " ";
  });
  const words = withoutHeadings
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MARKDOWN_TITLE_SOURCE_MAX_WORDS);
  if (headings.length === 0 && words.length === 0) return null;

  const parts: string[] = [];
  if (headings.length > 0) {
    parts.push(`Headings:\n${headings.map((heading) => `- ${heading}`).join("\n")}`);
  }
  if (words.length > 0) {
    parts.push(words.join(" "));
  }
  return parts.join("\n\n");
}
