export const HANOKI_ASSET_SCHEME = "hanoki-asset";

const ASSET_HOST = "asset";

const REMOTE_IMAGE_SRC = /^(?:https?:|data:|blob:)/i;
const OTHER_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function isNoteLocalImageSrc(src: string): boolean {
  const value = src.trim();
  if (!value || value.startsWith("//")) return false;
  if (REMOTE_IMAGE_SRC.test(value)) return false;
  if (value.startsWith(`${HANOKI_ASSET_SCHEME}:`)) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true;
  if (value.startsWith("file:")) return true;
  if (OTHER_SCHEME.test(value)) return false;
  return true;
}

export function imageDisplaySrc(
  src: string,
  target: { workspaceId: string; itemId: string },
): string {
  if (!isNoteLocalImageSrc(src)) return "";
  return noteImageUrl(target.workspaceId, target.itemId, src);
}

export function noteImageUrl(workspaceId: string, itemId: string, src: string): string {
  const url = new URL(
    `${HANOKI_ASSET_SCHEME}://${ASSET_HOST}/${encodeURIComponent(workspaceId)}/${encodeURIComponent(itemId)}`,
  );
  url.searchParams.set("src", src);
  return url.href;
}

export function parseNoteImageUrl(
  raw: string,
): { workspaceId: string; itemId: string; src: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${HANOKI_ASSET_SCHEME}:` || url.hostname !== ASSET_HOST) return null;
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2) return null;
  const workspaceId = pathSegment(segments[0]);
  const itemId = pathSegment(segments[1]);
  const src = url.searchParams.get("src");
  if (!workspaceId || !itemId || src === null || src.length === 0) return null;
  return { workspaceId, itemId, src };
}

function pathSegment(value: string | undefined): string | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0")
  ) {
    return null;
  }
  return decoded;
}
