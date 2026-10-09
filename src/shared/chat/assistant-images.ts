export function isRemoteImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function imageReplacement(alt: string): string {
  const text = alt.trim();
  return text.length > 0 ? text : "";
}

function htmlImageAlt(tag: string): string {
  const match = /alt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function htmlImageSrc(tag: string): string {
  const match = /src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripRemoteAssistantImages(markdown: string): string {
  const definitions: Array<{ id: string; url: string; line: string }> = [];
  for (const match of markdown.matchAll(/^\[([^\]]+)\]:[ \t]+(\S+)[^\n]*$/gm)) {
    const id = match[1];
    const url = match[2];
    const line = match[0];
    if (!id || !url || !line) continue;
    definitions.push({ id, url, line });
  }
  const remoteIds = new Set(
    definitions
      .filter((definition) => isRemoteImageUrl(definition.url))
      .map((definition) => definition.id.toLowerCase()),
  );

  let next = markdown.replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (match, alt: string, id: string) =>
    remoteIds.has(id.toLowerCase()) ? imageReplacement(alt) : match,
  );

  for (const definition of definitions) {
    if (!remoteIds.has(definition.id.toLowerCase())) continue;
    const linkUse = new RegExp(`(?<!!)\\[[^\\]\\n]*\\]\\[${escapeRegExp(definition.id)}\\]`, "i");
    if (linkUse.test(next)) continue;
    next = next.replace(definition.line, "");
  }

  next = next.replace(
    /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
    (match, alt: string, url: string) => (isRemoteImageUrl(url) ? imageReplacement(alt) : match),
  );

  next = next.replace(/<img\b[^>]*>/gi, (tag) =>
    isRemoteImageUrl(htmlImageSrc(tag)) ? imageReplacement(htmlImageAlt(tag)) : tag,
  );

  return next;
}
