import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseNoteImageUrl } from "@shared/assets/protocol";

const IMAGE_TYPES = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".ico", "image/x-icon"],
  [".svg", "image/svg+xml"],
]);

export const MAX_NOTE_IMAGE_BYTES = 25 * 1024 * 1024;

export type NoteImageFailure = "traversal" | "symlink" | "outside" | "type" | "missing";

export interface LoadedNoteImage {
  status: number;
  body: Uint8Array;
  contentType: string;
  reason?: NoteImageFailure;
}

export interface NoteImageLocation {
  root: string;
  noteDirectory: string;
}

type PathApi = typeof path | typeof path.win32;

export async function loadNoteImage(
  requestUrl: string,
  locate: (workspaceId: string, itemId: string) => NoteImageLocation | null,
): Promise<LoadedNoteImage> {
  const parsed = parseNoteImageUrl(requestUrl);
  if (!parsed) return failure("missing");

  let location: NoteImageLocation | null;
  try {
    location = locate(parsed.workspaceId, parsed.itemId);
  } catch {
    return failure("missing");
  }
  if (!location) return failure("missing");

  const resolved = await resolveNoteImage(location.root, location.noteDirectory, parsed.src);
  if (!resolved.ok) return failure(resolved.reason);

  try {
    const body = await readFile(resolved.filePath);
    return { status: 200, body, contentType: resolved.contentType };
  } catch {
    return failure("missing");
  }
}

export async function resolveNoteImage(
  root: string,
  noteDirectory: string,
  src: string,
): Promise<
  { ok: true; filePath: string; contentType: string } | { ok: false; reason: NoteImageFailure }
> {
  const lexical = resolveNoteImageLexical(root, noteDirectory, src);
  if (!lexical.ok) return lexical;

  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return { ok: false, reason: "missing" };
  }

  const noteLexical = path.resolve(noteDirectory);
  if (!isInside(rootReal, noteLexical, path)) return { ok: false, reason: "traversal" };

  let noteReal: string;
  try {
    noteReal = await realpath(noteLexical);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!isInside(rootReal, noteReal, path)) return { ok: false, reason: "symlink" };

  const canonical = resolveNoteImageLexical(rootReal, noteReal, src);
  if (!canonical.ok) return canonical;

  let filePath: string;
  try {
    filePath = await realpath(canonical.filePath);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!isInside(rootReal, filePath, path)) return { ok: false, reason: "symlink" };

  const contentType = IMAGE_TYPES.get(path.extname(filePath).toLowerCase());
  if (!contentType) return { ok: false, reason: "type" };

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return { ok: false, reason: "missing" };
    if (fileStat.size > MAX_NOTE_IMAGE_BYTES) return { ok: false, reason: "missing" };
  } catch {
    return { ok: false, reason: "missing" };
  }

  return { ok: true, filePath, contentType };
}

export function resolveNoteImageLexical(
  root: string,
  noteDirectory: string,
  src: string,
): { ok: true; filePath: string; absolute: boolean } | { ok: false; reason: NoteImageFailure } {
  const api = pathApi(root);
  const decoded = decodeOnce(src);
  if (decoded === null) return { ok: false, reason: "traversal" };
  if (isUncOrDevice(decoded)) return { ok: false, reason: "outside" };

  const rootLexical = api.resolve(root);
  const noteLexical = api.resolve(noteDirectory);
  if (!isInside(rootLexical, noteLexical, api)) return { ok: false, reason: "traversal" };

  const located = locateRequestedPath(noteLexical, decoded, api);
  if (!located.ok) return located;
  if (isUncOrDevice(located.path)) return { ok: false, reason: "outside" };

  const filePath =
    api === path.win32 ? path.win32.normalize(located.path) : path.resolve(located.path);
  if (!isInside(rootLexical, filePath, api)) {
    return { ok: false, reason: located.absolute ? "outside" : "traversal" };
  }
  return { ok: true, filePath, absolute: located.absolute };
}

function locateRequestedPath(
  noteLexical: string,
  decoded: string,
  api: PathApi,
): { ok: true; path: string; absolute: boolean } | { ok: false; reason: NoteImageFailure } {
  if (decoded.startsWith("file:")) {
    let url: URL;
    try {
      url = new URL(decoded);
    } catch {
      return { ok: false, reason: "outside" };
    }
    if (url.protocol !== "file:") return { ok: false, reason: "outside" };
    let filePath: string;
    try {
      filePath = fileURLToPath(url);
    } catch {
      return { ok: false, reason: "outside" };
    }
    return { ok: true, path: filePath, absolute: true };
  }

  if (api === path && path.win32.isAbsolute(decoded) && !path.posix.isAbsolute(decoded)) {
    return { ok: false, reason: "outside" };
  }
  if (api.isAbsolute(decoded)) return { ok: true, path: decoded, absolute: true };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return { ok: false, reason: "outside" };

  const relative = api === path.win32 ? decoded : decoded.replaceAll("\\", "/");
  return { ok: true, path: api.resolve(noteLexical, relative), absolute: false };
}

function pathApi(root: string): PathApi {
  if (/^[a-zA-Z]:[\\/]/.test(root) || root.startsWith("\\\\")) return path.win32;
  return path;
}

function isUncOrDevice(value: string): boolean {
  return value.startsWith("\\\\") || value.startsWith("//");
}

function decodeOnce(value: string): string | null {
  let decoded = value;
  if (value.includes("%")) {
    try {
      decoded = decodeURIComponent(value);
    } catch {
      decoded = value;
    }
  }
  if (hasControlChar(decoded)) return null;
  return decoded;
}

function isInside(root: string, target: string, api: PathApi): boolean {
  const relative = api.relative(root, target);
  if (relative === "" || relative === ".") return true;
  if (relative === ".." || relative.startsWith(`..${api.sep}`)) return false;
  return !api.isAbsolute(relative);
}

function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) return true;
  }
  return false;
}

function failure(reason: NoteImageFailure): LoadedNoteImage {
  return {
    status: reason === "missing" ? 404 : 403,
    body: new Uint8Array(),
    contentType: "text/plain",
    reason,
  };
}
