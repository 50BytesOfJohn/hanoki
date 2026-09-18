import type { WebContents } from "electron";

import type { NotesFolderImportResult } from "@shared/markdown/folder-io";
import type { AppServices } from "../services";
import { pickNotesFolder } from "./pick-directory";
import { collectMarkdownFiles, folderNameFromPathSegment } from "./serialize";

export async function importMarkdownNotesFolder({
  services,
  sender,
  workspaceId,
}: {
  services: AppServices;
  sender: WebContents;
  workspaceId: string;
}): Promise<NotesFolderImportResult> {
  requireWorkspace(services, workspaceId);
  const source = await pickNotesFolder({
    sender,
    title: "Import markdown notes",
    buttonLabel: "Import",
  });

  if (!source) {
    return { status: "canceled" };
  }

  const collected = await collectMarkdownFiles(source);
  const folderIds = new Map<string, string>();
  const warnings = collected.skipped.map((entry) => entry.reason);
  let noteCount = 0;

  for (const file of collected.files) {
    try {
      const folderId = ensureImportedFolder(services, workspaceId, file.folderSegments, folderIds);
      const item = services.chatTree.createMarkdown({
        workspaceId,
        title: file.title,
        folderId,
      });
      services.chatTree.queueMarkdownContent(item.id, file.body);
      services.chatTree.flushMarkdownContent(item.id);
      noteCount += 1;
    } catch (error) {
      warnings.push(
        `${file.relativePath} could not be imported${error instanceof Error ? `: ${error.message}` : "."}`,
      );
    }
  }

  return {
    status: "imported",
    folderPath: source,
    noteCount,
    folderCount: folderIds.size,
    skippedCount: collected.files.length - noteCount + collected.skipped.length,
    warnings,
  };
}

function ensureImportedFolder(
  services: AppServices,
  workspaceId: string,
  segments: string[],
  folderIds: Map<string, string>,
): string | null {
  let parentId: string | null = null;
  let pathKey = "";

  for (const segment of segments) {
    pathKey = pathKey ? `${pathKey}/${segment}` : segment;
    const existingId = folderIds.get(pathKey);
    if (existingId) {
      parentId = existingId;
      continue;
    }

    const folder = services.chatTree.createFolder({
      workspaceId,
      name: folderNameFromPathSegment(segment),
      parentId,
    });
    folderIds.set(pathKey, folder.id);
    parentId = folder.id;
  }

  return parentId;
}

function requireWorkspace(services: AppServices, workspaceId: string): void {
  const workspace = services.workspaces.listWorkspaces().find((entry) => entry.id === workspaceId);
  if (!workspace) {
    throw new Error(`Workspace "${workspaceId}" does not exist.`);
  }
}
