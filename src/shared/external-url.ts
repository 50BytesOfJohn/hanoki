const OPENABLE_SCHEMES = new Set(["https:", "http:", "mailto:"]);

export function externalUrlToOpen(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!OPENABLE_SCHEMES.has(parsed.protocol)) return null;
  if (parsed.protocol !== "mailto:" && parsed.hostname.length === 0) return null;
  return parsed.href;
}
