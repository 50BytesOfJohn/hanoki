import { basename } from "node:path";
import type { WebContents } from "electron";

import { SYSTEM_EVENT_CHANNEL } from "@shared/events";
import { FOLDER_NAME_MAX_LENGTH } from "@shared/folder/folder-name";
import {
  NOTES_FOLDER_IMPORT_PROGRESS_MIN,
  type NotesFolderImportFailure,
  type NotesFolderImportProgress,
  type NotesFolderImportResult,
} from "@shared/markdown/folder-io";

import type { ChatTreeService } from "../services/chat-tree-service";
import type { AppServices } from "../services";
import { pickNotesFolder } from "./pick-directory";
import {
  collectMarkdownFiles,
  folderNameFromPathSegment,
  type CollectedMarkdownFile,
  type NotesFolderSkippedEntry,
} from "./serialize";

const IMPORTED_PARENT_NAME = "Imported";

export type NotesFolderImportTree = Pick<
  ChatTreeService,
  | "createFolder"
  | "createMarkdown"
  | "queueMarkdownContent"
  | "flushMarkdownContent"
  | "listChildFolders"
> & {
  rebuildNoteLinks?: (workspaceId: string) => void;
  deleteFolder?: (id: string) => void;
};

export interface ImportMarkdownNotesOptions {
  now?: () => Date;
  isCanceled?: () => boolean;
  onProgress?: (progress: NotesFolderImportProgress) => void;
}

const canceledSenders = new Set<number>();

export function requestMarkdownNotesImportCancel(senderId: number): void {
  canceledSenders.add(senderId);
}

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
  canceledSenders.delete(sender.id);
  const source = await pickNotesFolder({
    sender,
    title: "Import markdown notes",
    buttonLabel: "Import",
  });

  if (!source) {
    return { status: "canceled" };
  }

  try {
    return await importMarkdownNotesFromDirectory(services.chatTree, workspaceId, source, {
      isCanceled: () => canceledSenders.has(sender.id),
      onProgress: (progress) => {
        if (progress.total < NOTES_FOLDER_IMPORT_PROGRESS_MIN) return;
        sender.send(SYSTEM_EVENT_CHANNEL, {
          type: "markdown:import-progress",
          workspaceId,
          ...progress,
        });
      },
    });
  } finally {
    canceledSenders.delete(sender.id);
  }
}

export async function importMarkdownNotesFromDirectory(
  chatTree: NotesFolderImportTree,
  workspaceId: string,
  source: string,
  options?: ImportMarkdownNotesOptions,
): Promise<Extract<NotesFolderImportResult, { status: "imported" }>> {
  const collected = await collectMarkdownFiles(source);
  const { kept, duplicatePaths } = partitionImports(collected.files);
  const skipSummary = summarizeSkipped(collected.skipped);
  const failures: NotesFolderImportFailure[] = collected.skipped
    .filter((entry) => entry.kind === "unreadable")
    .map((entry) => ({
      relativePath: entry.relativePath,
      reason: entry.reason ?? "Could not be read.",
    }));
  const warnings = collected.skipped
    .filter((entry) => entry.kind === "oversized" || entry.kind === "unreadable")
    .map((entry) => entry.reason ?? entry.relativePath);

  const { parentId, createdParent, wrapId, wrapName } = createWrapRoot(
    chatTree,
    workspaceId,
    vaultNameFromSource(source),
    options?.now?.() ?? new Date(),
  );
  const folderIds = new Map<string, string>();
  let noteCount = 0;
  let canceled = false;

  for (let index = 0; index < kept.length; index += 1) {
    if (options?.isCanceled?.()) {
      canceled = true;
      break;
    }

    const file = kept[index]!;
    options?.onProgress?.({
      folderPath: source,
      index: index + 1,
      total: kept.length,
      relativePath: file.relativePath,
    });

    try {
      const folderId = ensureImportedFolder(
        chatTree,
        workspaceId,
        file.folderSegments,
        folderIds,
        wrapId,
      );
      const item = chatTree.createMarkdown({
        workspaceId,
        title: file.title,
        folderId,
        importRelativePath: vaultRelativeNotePath(file.relativePath),
      });
      chatTree.queueMarkdownContent(item.id, file.body);
      chatTree.flushMarkdownContent(item.id);
      noteCount += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not be imported.";
      failures.push({ relativePath: file.relativePath, reason });
      warnings.push(`${file.relativePath} could not be imported: ${reason}`);
    }
  }

  const removedEmptyWrap = canceled && noteCount === 0;
  if (removedEmptyWrap) {
    removeEmptyWrap(chatTree, workspaceId, parentId, createdParent, wrapId);
  }

  chatTree.rebuildNoteLinks?.(workspaceId);

  const skippedDuplicatePathCount = duplicatePaths.length;
  return {
    status: "imported",
    folderPath: source,
    wrapFolderPath: `${IMPORTED_PARENT_NAME}/${wrapName}`,
    noteCount,
    folderCount: removedEmptyWrap ? 0 : folderIds.size + 1 + (createdParent ? 1 : 0),
    skippedCount: skippedDuplicatePathCount + skipSummary.skippedOversizedCount,
    skippedDuplicatePathCount,
    skippedPaths: duplicatePaths,
    failedCount: failures.length,
    failures,
    canceled,
    skippedOversizedCount: skipSummary.skippedOversizedCount,
    ignoredNonMarkdownCount: skipSummary.ignoredNonMarkdownCount,
    ignoredDirectoryNames: skipSummary.ignoredDirectoryNames,
    warnings,
  };
}

export function vaultRelativeNotePath(relativePath: string): string {
  return relativePath.replace(/\.md$/i, "");
}

function createWrapRoot(
  chatTree: NotesFolderImportTree,
  workspaceId: string,
  vaultName: string,
  now: Date,
) {
  const roots = chatTree.listChildFolders(workspaceId, null);
  const existingParent = roots.find(
    (folder) => folder.name.toLowerCase() === IMPORTED_PARENT_NAME.toLowerCase(),
  );
  const parentId =
    existingParent?.id ??
    chatTree.createFolder({
      workspaceId,
      name: IMPORTED_PARENT_NAME,
      parentId: null,
    }).id;
  const siblings = chatTree.listChildFolders(workspaceId, parentId);
  const wrapName = uniqueChildName(
    siblings.map((folder) => folder.name),
    vaultName,
    now,
  );
  const wrap = chatTree.createFolder({
    workspaceId,
    name: wrapName,
    parentId,
  });
  return { parentId, createdParent: !existingParent, wrapId: wrap.id, wrapName };
}

function removeEmptyWrap(
  chatTree: NotesFolderImportTree,
  workspaceId: string,
  parentId: string,
  createdParent: boolean,
  wrapId: string,
): void {
  if (!chatTree.deleteFolder) return;
  chatTree.deleteFolder(wrapId);
  if (!createdParent) return;
  if (chatTree.listChildFolders(workspaceId, parentId).length > 0) return;
  chatTree.deleteFolder(parentId);
}

function uniqueChildName(existingNames: readonly string[], preferred: string, now: Date): string {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!taken.has(preferred.toLowerCase())) return preferred;

  const stamp = formatStamp(now);
  const stamped = fitFolderName(preferred, stamp);
  if (!taken.has(stamped.toLowerCase())) return stamped;

  for (let attempt = 2; attempt <= 1000; attempt += 1) {
    const next = fitFolderName(preferred, `${stamp}-${attempt}`);
    if (!taken.has(next.toLowerCase())) return next;
  }

  throw new Error(`Could not name an import folder for "${preferred}".`);
}

function fitFolderName(preferred: string, suffix: string): string {
  const extra = `-${suffix}`;
  const room = Math.max(1, FOLDER_NAME_MAX_LENGTH - extra.length);
  return `${preferred.slice(0, room)}${extra}`;
}

function formatStamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function vaultNameFromSource(source: string): string {
  const base = basename(source).replace(/[\\/]/g, "").trim();
  if (!base || base === "." || base === "..") return "Vault";
  return folderNameFromPathSegment(base);
}

function partitionImports(files: readonly CollectedMarkdownFile[]) {
  const sorted = [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "en"),
  );
  const seen = new Set<string>();
  const kept: CollectedMarkdownFile[] = [];
  const duplicatePaths: string[] = [];

  for (const file of sorted) {
    const key = file.relativePath.toLowerCase();
    if (seen.has(key)) {
      duplicatePaths.push(file.relativePath);
      continue;
    }
    seen.add(key);
    kept.push(file);
  }

  return { kept, duplicatePaths };
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
  wrapId: string,
): string {
  let parentId = wrapId;
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
