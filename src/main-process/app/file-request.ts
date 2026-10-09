export function fileRequestHasHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" && parsed.hostname !== "";
  } catch {
    return false;
  }
}
