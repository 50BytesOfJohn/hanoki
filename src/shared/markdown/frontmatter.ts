export interface MarkdownParts {
  frontmatter: string | null;
  body: string;
}

const OPENER = /^(---)[ \t]*(?:\r\n|\n|\r)/;
const CLOSER = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/m;

/** Split a leading YAML block. The returned frontmatter keeps its original bytes. */
export function splitFrontmatter(markdown: string): MarkdownParts {
  const bom = markdown.startsWith("\uFEFF") ? "\uFEFF" : "";
  const source = markdown.slice(bom.length);
  const opener = OPENER.exec(source);
  if (!opener) return { frontmatter: null, body: markdown };
  const closer = CLOSER.exec(source.slice(opener[0].length));
  if (!closer) return { frontmatter: null, body: markdown };
  const end = bom.length + opener[0].length + closer.index + closer[0].length;
  return { frontmatter: markdown.slice(0, end), body: markdown.slice(end) };
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (!frontmatter) return body;
  return frontmatter + body;
}
