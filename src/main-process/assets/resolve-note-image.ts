import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

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
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return { ok: false, reason: "missing" };
  }

  const noteLexical = path.resolve(noteDirectory);
  if (!isInside(rootReal, noteLexical)) return { ok: false, reason: "traversal" };

  let noteReal: string;
  try {
    noteReal = await realpath(noteLexical);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!isInside(rootReal, noteReal)) return { ok: false, reason: "symlink" };

  const located = locateRequestedPath(noteReal, src);
  if (!located.ok) return located;

  const lexical = path.resolve(located.path);
  const lexicalInside = isInside(rootReal, lexical);
  let filePath: string;
  try {
    filePath = await realpath(lexical);
  } catch {
    if (!lexicalInside) {
      return { ok: false, reason: located.absolute ? "outside" : "traversal" };
    }
    return { ok: false, reason: "missing" };
  }
  if (!isInside(rootReal, filePath)) {
    return {
      ok: false,
      reason: lexicalInside ? "symlink" : located.absolute ? "outside" : "traversal",
    };
  }

  const contentType = IMAGE_TYPES.get(path.extname(filePath).toLowerCase());
  if (!contentType) return { ok: false, reason: "type" };

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return { ok: false, reason: "missing" };
  } catch {
    return { ok: false, reason: "missing" };
  }

  return { ok: true, filePath, contentType };
}

function locateRequestedPath(
  noteReal: string,
  src: string,
): { ok: true; path: string; absolute: boolean } | { ok: false; reason: NoteImageFailure } {
  const decoded = fullyDecode(src);
  if (decoded === null) return { ok: false, reason: "traversal" };

  if (decoded.startsWith("file:")) {
    let url: URL;
    try {
      url = new URL(decoded);
    } catch {
      return { ok: false, reason: "outside" };
    }
    if (url.protocol !== "file:") return { ok: false, reason: "outside" };
    if (url.hostname !== "" && url.hostname !== "localhost") {
      return { ok: false, reason: "outside" };
    }
    const filePath = fullyDecode(url.pathname);
    if (filePath === null) return { ok: false, reason: "traversal" };
    return { ok: true, path: filePath, absolute: true };
  }

  if (/^[a-zA-Z]:[\\/]/.test(decoded) && process.platform !== "win32") {
    return { ok: false, reason: "outside" };
  }
  if (path.isAbsolute(decoded)) {
    return { ok: true, path: decoded, absolute: true };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
    return { ok: false, reason: "outside" };
  }

  return { ok: true, path: path.resolve(noteReal, decoded.replaceAll("\\", "/")), absolute: false };
}

function fullyDecode(value: string): string | null {
  let current = value;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!current.includes("%")) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      return null;
    }
  }
  if (hasControlChar(current)) return null;
  return current;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (relative === "" || relative === ".") return true;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
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
