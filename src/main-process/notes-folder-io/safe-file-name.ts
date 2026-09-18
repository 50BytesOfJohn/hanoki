export function safeFileName(title: string, fallback: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || fallback
  );
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
