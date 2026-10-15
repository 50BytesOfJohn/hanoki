import path from "node:path";
import { protocol } from "electron";

import { HANOKI_ASSET_SCHEME } from "@shared/assets/protocol";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";
import { getFolderById, getItemById } from "../chat-tree/repository";
import { loadNoteImage, type NoteImageLocation } from "./resolve-note-image";
import { currentNotesRoot } from "./notes-root";

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: HANOKI_ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function attachAssetProtocol(): void {
  protocol.handle(HANOKI_ASSET_SCHEME, (request) => handleAssetRequest(request));
}

export async function handleAssetRequest(request: Request): Promise<Response> {
  const loaded = await loadNoteImage(request.url, locateNoteImage);
  const headers = new Headers({
    "Content-Type": loaded.contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  if (loaded.status === 200) {
    headers.set("Content-Security-Policy", "default-src 'none'");
  }
  return new Response(new Uint8Array(loaded.body), { status: loaded.status, headers });
}

function locateNoteImage(workspaceId: string, itemId: string): NoteImageLocation | null {
  try {
    if (!parseWorkspaceId(workspaceId).ok) return null;
    const item = getItemById(itemId);
    if (!item || item.type !== "markdown" || item.workspaceId !== workspaceId) return null;
    const root = currentNotesRoot(workspaceId);
    return { root, noteDirectory: path.resolve(root, ...folderNames(workspaceId, item.folderId)) };
  } catch {
    return null;
  }
}

function folderNames(workspaceId: string, folderId: string | null): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current && !seen.has(current) && names.length < 40) {
    seen.add(current);
    const folder = getFolderById(current);
    if (!folder || folder.workspaceId !== workspaceId) break;
    names.push(folder.name);
    current = folder.parentId;
  }
  return names.reverse();
}
