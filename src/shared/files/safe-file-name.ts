const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function safeFileName(title: string, fallback: string): string {
  const sanitized =
    title
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || fallback;

  const unreserved = avoidWindowsReservedName(sanitized).slice(0, 120);
  return unreserved || fallback;
}

export function uniqueName(base: string, used: Set<string>, ext = ""): string {
  const withExt = (stem: string) => (ext ? `${stem}${ext}` : stem);
  const keyOf = (name: string) => name.toLowerCase();

  let name = withExt(base);
  if (!used.has(keyOf(name))) {
    used.add(keyOf(name));
    return name;
  }

  for (let n = 2; ; n += 1) {
    name = withExt(`${base}-${n}`);
    if (!used.has(keyOf(name))) {
      used.add(keyOf(name));
      return name;
    }
  }
}

function avoidWindowsReservedName(name: string): string {
  if (!WINDOWS_RESERVED_NAME.test(name)) return name;
  const dot = name.indexOf(".");
  if (dot === -1) return `${name}-file`;
  return `${name.slice(0, dot)}-file${name.slice(dot)}`;
}
