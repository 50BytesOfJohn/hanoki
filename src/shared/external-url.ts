const OPENABLE_SCHEMES = new Set(["https:", "http:", "mailto:"]);
const MAILTO_PARAMS = new Set(["subject", "body", "cc", "bcc"]);

function mailtoRecipient(pathname: string): string | null {
  let recipient = pathname;
  for (let i = 0; i < 5 && /%[0-9A-Fa-f]{2}/.test(recipient); i++) {
    try {
      recipient = decodeURIComponent(recipient);
    } catch {
      return null;
    }
  }
  if (recipient.includes("?") || recipient.includes("#") || /%3F|%23/i.test(recipient)) {
    return null;
  }
  return recipient;
}

function mailtoToOpen(parsed: URL): string | null {
  const recipient = mailtoRecipient(parsed.pathname);
  if (recipient == null) return null;
  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    const name = key.toLowerCase();
    if (!MAILTO_PARAMS.has(name)) continue;
    kept.append(name, value);
  }
  const query = kept.toString();
  return query.length > 0 ? `mailto:${recipient}?${query}` : `mailto:${recipient}`;
}

export function externalUrlToOpen(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!OPENABLE_SCHEMES.has(parsed.protocol)) return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.protocol === "mailto:") return mailtoToOpen(parsed);
  if (parsed.hostname.length === 0) return null;
  return parsed.href;
}
