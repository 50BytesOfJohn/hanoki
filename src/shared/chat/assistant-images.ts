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

export function isHttpImageUrl(url: string): boolean {
  try {
    const protocol = new URL(url.trim()).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function isNonHttpRemoteImageUrl(url: string): boolean {
  return isRemoteImageUrl(url) && !isHttpImageUrl(url);
}
