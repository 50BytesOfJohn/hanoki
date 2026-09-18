import type { WebContents } from "electron";

import type { NotesFolderImportResult } from "@shared/markdown/folder-io";
import type { ChatTreeService } from "../services/chat-tree-service";
import type { AppServices } from "../services";
import { pickNotesFolder } from "./pick-directory";
import {
  collectMarkdownFiles,
  folderNameFromPathSegment,
  type NotesFolderSkippedEntry,
} from "./serialize";

export type NotesFolderImportTree = Pick<
  ChatTreeService,
  "createFolder" | "createMarkdown" | "queueMarkdownContent" | "flushMarkdownContent"
>;

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

  return importMarkdownNotesFromDirectory(services.chatTree, workspaceId, source);
}

export async function importMarkdownNotesFromDirectory(
  chatTree: NotesFolderImportTree,
  workspaceId: string,
  source: string,
): Promise<Extract<NotesFolderImportResult, { status: "imported" }>> {
  const collected = await collectMarkdownFiles(source);
  const folderIds = new Map<string, string>();
  const skipSummary = summarizeSkipped(collected.skipped);
  const warnings = collected.skipped
    .filter((entry) => entry.kind === "oversized" || entry.kind === "unreadable")
    .map((entry) => entry.reason ?? entry.relativePath);
  let noteCount = 0;

  for (const file of collected.files) {
    try {
      const folderId = ensureImportedFolder(chatTree, workspaceId, file.folderSegments, folderIds);
      const item = chatTree.createMarkdown({
        workspaceId,
        title: file.title,
        folderId,
      });
      chatTree.queueMarkdownContent(item.id, file.body);
      chatTree.flushMarkdownContent(item.id);
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
    skippedCount:
      collected.files.length -
      noteCount +
      skipSummary.skippedOversizedCount +
      collected.skipped.filter((entry) => entry.kind === "unreadable").length,
    skippedOversizedCount: skipSummary.skippedOversizedCount,
    ignoredNonMarkdownCount: skipSummary.ignoredNonMarkdownCount,
    ignoredDirectoryNames: skipSummary.ignoredDirectoryNames,
    warnings,
  };
}

function summarizeSkipped(skipped: NotesFolderSkippedEntry[]) {
  let skippedOversizedCount = 0;
  let ignoredNonMarkdownCount = 0;
  const ignoredDirectoryNames = new Set<string>();

  for (const entry of skipped) {
    if (entry.kind === "oversized") {
      skippedOversizedCount += 1;
      continue;
    }
    if (entry.kind === "non-markdown") {
      ignoredNonMarkdownCount += 1;
      continue;
    }
    if (entry.kind === "ignored-directory") {
      const name = entry.relativePath.split("/").pop() ?? entry.relativePath;
      ignoredDirectoryNames.add(name);
    }
  }

  return {
    skippedOversizedCount,
    ignoredNonMarkdownCount,
    ignoredDirectoryNames: [...ignoredDirectoryNames].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function ensureImportedFolder(
  chatTree: NotesFolderImportTree,
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

    const folder = chatTree.createFolder({
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
