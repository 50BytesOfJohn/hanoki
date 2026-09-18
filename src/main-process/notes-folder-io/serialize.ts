import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CHAT_TITLE_MAX_LENGTH } from "@shared/chat/chat-title";
import { FOLDER_NAME_MAX_LENGTH } from "@shared/folder/folder-name";
import type { ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo } from "@shared/ipc";
import { MAX_MARKDOWN_FILE_BYTES, MAX_MARKDOWN_LENGTH } from "@shared/markdown/content";
import { DEFAULT_MARKDOWN_TITLE } from "@shared/markdown/title-source";

import { safeFileName, uniqueName } from "./safe-file-name";

export const IGNORED_DIRECTORY_NAMES = new Set([".obsidian", ".git"]);

export interface NotesFolderExportFile {
  relativePath: string;
  body: string;
}

export interface NotesFolderExportPlan {
  directories: string[];
  files: NotesFolderExportFile[];
}

export interface CollectedMarkdownFile {
  relativePath: string;
  folderSegments: string[];
  title: string;
  body: string;
}

export interface CollectMarkdownFilesResult {
  files: CollectedMarkdownFile[];
  skipped: { relativePath: string; reason: string }[];
}

export function buildNotesFolderExportPlan(snapshot: ChatTreeSnapshot): NotesFolderExportPlan {
  const directories: string[] = [];
  const files: NotesFolderExportFile[] = [];
  const rootUsed = new Set<string>();

  for (const folder of snapshot.rootFolders) {
    walkFolder(folder, "", rootUsed, directories, files);
  }
  writeMarkdownItems(snapshot.rootItems, "", rootUsed, files);

  return { directories, files };
}

export async function writeNotesFolderExportPlan(
  destination: string,
  plan: NotesFolderExportPlan,
): Promise<void> {
  for (const directory of plan.directories) {
    await mkdir(resolveUnder(destination, directory), { recursive: true });
  }

  for (const file of plan.files) {
    const fullPath = resolveUnder(destination, file.relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.body, "utf8");
  }
}

export async function collectMarkdownFiles(
  sourceRoot: string,
): Promise<CollectMarkdownFilesResult> {
  const files: CollectedMarkdownFile[] = [];
  const skipped: { relativePath: string; reason: string }[] = [];
  await walkImportDirectory(sourceRoot, [], files, skipped);
  return { files, skipped };
}

export function titleFromMarkdownFileName(fileName: string): string {
  const base = fileName.replace(/\.md$/i, "").trim();
  if (!base) return DEFAULT_MARKDOWN_TITLE;
  return base.slice(0, CHAT_TITLE_MAX_LENGTH);
}

export function folderNameFromPathSegment(segment: string): string {
  const name = segment.trim().slice(0, FOLDER_NAME_MAX_LENGTH);
  return name || "Folder";
}

function walkFolder(
  folder: ChatTreeFolderNode,
  parentRelativePath: string,
  siblingNames: Set<string>,
  directories: string[],
  files: NotesFolderExportFile[],
): void {
  const folderName = uniqueName(safeFileName(folder.name, "Folder"), siblingNames);
  const relativePath = joinRelative(parentRelativePath, folderName);
  directories.push(relativePath);

  const childNames = new Set<string>();
  for (const child of folder.folders) {
    walkFolder(child, relativePath, childNames, directories, files);
  }
  writeMarkdownItems(folder.items, relativePath, childNames, files);
}

function writeMarkdownItems(
  items: readonly ItemInfo[],
  parentRelativePath: string,
  siblingNames: Set<string>,
  files: NotesFolderExportFile[],
): void {
  for (const item of items) {
    if (item.type !== "markdown") continue;
    const fileName = uniqueName(safeFileName(item.title, "Note"), siblingNames, ".md");
    files.push({
      relativePath: joinRelative(parentRelativePath, fileName),
      body: item.data.markdown,
    });
  }
}

async function walkImportDirectory(
  directory: string,
  relativeSegments: string[],
  files: CollectedMarkdownFile[],
  skipped: { relativePath: string; reason: string }[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;

    const nextSegments = [...relativeSegments, entry.name];
    const relativePath = nextSegments.join("/");
    const fullPath = join(directory, entry.name);

    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      await walkImportDirectory(fullPath, nextSegments, files, skipped);
      continue;
    }

    if (!entry.isFile() || !isMarkdownFileName(entry.name)) continue;

    try {
      const fileStat = await stat(fullPath);
      if (fileStat.size > MAX_MARKDOWN_FILE_BYTES) {
        skipped.push({
          relativePath,
          reason: `${relativePath} is larger than 5 MiB and was skipped.`,
        });
        continue;
      }

      const body = await readFile(fullPath, "utf8");
      if (body.length > MAX_MARKDOWN_LENGTH) {
        skipped.push({
          relativePath,
          reason: `${relativePath} is larger than 5 MiB and was skipped.`,
        });
        continue;
      }

      files.push({
        relativePath,
        folderSegments: relativeSegments,
        title: titleFromMarkdownFileName(entry.name),
        body,
      });
    } catch (error) {
      skipped.push({
        relativePath,
        reason: `${relativePath} could not be read${error instanceof Error ? `: ${error.message}` : "."}`,
      });
    }
  }
}

function isMarkdownFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".md");
}

function joinRelative(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function resolveUnder(root: string, relativePosix: string): string {
  const segments = relativePosix.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    throw new Error(`Invalid relative path "${relativePosix}".`);
  }
  return join(root, ...segments);
}
