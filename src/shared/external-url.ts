const OPENABLE_SCHEMES = new Set(["https:", "http:", "mailto:"]);
const MAILTO_PARAMS = ["subject", "body", "cc", "bcc"] as const;

export function externalUrlToOpen(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!OPENABLE_SCHEMES.has(parsed.protocol)) return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.protocol === "mailto:") {
    const kept = new URLSearchParams();
    for (const key of MAILTO_PARAMS) {
      const value = parsed.searchParams.get(key);
      if (value != null) kept.append(key, value);
    }
    const query = kept.toString();
    return query.length > 0 ? `mailto:${parsed.pathname}?${query}` : `mailto:${parsed.pathname}`;
  }
  if (parsed.hostname.length === 0) return null;
  return parsed.href;
}
