export function isRemoteImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return true;
    return parsed.protocol === "file:" && parsed.hostname !== "";
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

function maskCode(markdown: string) {
  let marker = "";
  do {
    marker = `\uE000${crypto.randomUUID()}\uE001`;
  } while (markdown.includes(marker));
  const blocks: string[] = [];
  const hide = (block: string) => {
    const token = `${marker}${blocks.length}${marker}`;
    blocks.push(block);
    return token;
  };
  const lines = markdown.split("\n");
  const out: string[] = [];
  let closing: RegExp | null = null;
  let buffer: string[] = [];
  for (const line of lines) {
    if (!closing) {
      const open = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
      const marker = open?.[1];
      if (marker) {
        const fence = marker[0] === "`" ? "`" : "~";
        closing = new RegExp(`^[ \\t]{0,3}${fence}{${marker.length},}[ \\t]*$`);
        buffer = [line];
        continue;
      }
      out.push(line.replace(/`[^`\n]*`/g, hide));
      continue;
    }
    buffer.push(line);
    if (closing.test(line)) {
      out.push(hide(buffer.join("\n")));
      closing = null;
      buffer = [];
    }
  }
  if (closing) out.push(hide(buffer.join("\n")));
  return { text: out.join("\n"), blocks, marker };
}

function readInlineImage(
  source: string,
  start: number,
): { alt: string; url: string; end: number } | null {
  if (source[start - 1] === "\\") return null;
  let index = start + 2;
  const altStart = index;
  while (index < source.length && source[index] !== "]") {
    index += source[index] === "\\" ? 2 : 1;
  }
  if (source[index] !== "]") return null;
  const alt = source.slice(altStart, index);
  index += 1;
  if (source[index] !== "(") return null;
  index += 1;
  while (source[index] === " " || source[index] === "\t") index += 1;

  let url: string;
  if (source[index] === "<") {
    const end = source.indexOf(">", index + 1);
    if (end === -1) return null;
    url = source.slice(index + 1, end);
    index = end + 1;
  } else {
    const urlStart = index;
    let depth = 0;
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "(") {
        depth += 1;
        index += 1;
        continue;
      }
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
        index += 1;
        continue;
      }
      if ((char === " " || char === "\t" || char === "\n") && depth === 0) break;
      index += 1;
    }
    url = source.slice(urlStart, index);
  }

  while (source[index] === " " || source[index] === "\t") index += 1;
  const quote = source[index];
  if (quote === '"' || quote === "'") {
    index += 1;
    while (index < source.length && source[index] !== quote) {
      index += source[index] === "\\" ? 2 : 1;
    }
    if (source[index] === quote) index += 1;
  }
  while (source[index] === " " || source[index] === "\t") index += 1;
  if (source[index] !== ")") return null;
  return { alt, url, end: index + 1 };
}

function stripInlineImages(markdown: string): string {
  let result = "";
  let index = 0;
  while (index < markdown.length) {
    if (markdown.startsWith("![", index)) {
      const image = readInlineImage(markdown, index);
      if (image) {
        result += isRemoteImageUrl(image.url)
          ? imageReplacement(image.alt)
          : markdown.slice(index, image.end);
        index = image.end;
        continue;
      }
    }
    result += markdown[index] ?? "";
    index += 1;
  }
  return result;
}

export function stripRemoteAssistantImages(markdown: string): string {
  const masked = maskCode(markdown);
  const stripped = stripPlainAssistantImages(masked.text);
  return masked.blocks.reduce(
    (text, block, index) => text.replaceAll(`${masked.marker}${index}${masked.marker}`, block),
    stripped,
  );
}

function stripPlainAssistantImages(markdown: string): string {
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

  next = stripInlineImages(next);

  next = next.replace(/<img\b[^>]*>/gi, (tag) =>
    isRemoteImageUrl(htmlImageSrc(tag)) ? imageReplacement(htmlImageAlt(tag)) : tag,
  );

  return next;
}
