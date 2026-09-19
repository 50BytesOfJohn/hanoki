import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { FolderInfo, MarkdownInfo } from "@shared/ipc";
import { formatNotesFolderImportSummary } from "@shared/markdown/folder-io";
import { MAX_MARKDOWN_FILE_BYTES } from "@shared/markdown/content";

import { importMarkdownNotesFromDirectory, type NotesFolderImportTree } from "./import-notes";
import { buildNotesFolderExportPlan, writeNotesFolderExportPlan } from "./serialize";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hanoki-notes-import-"));
  tempDirs.push(dir);
  return dir;
}

function memoryTree() {
  const notes: MarkdownInfo[] = [];
  const folders: FolderInfo[] = [];
  let nextId = 1;
  const bodies = new Map<string, string>();

  const chatTree: NotesFolderImportTree = {
    createFolder({ workspaceId, name, parentId }) {
      const folder: FolderInfo = {
        id: `folder-new-${nextId}`,
        workspaceId,
        parentId,
        name,
        createdAt: nextId,
        updatedAt: nextId,
      };
      nextId += 1;
      folders.push(folder);
      return folder;
    },
    createMarkdown({ workspaceId, title, folderId }) {
      const item: MarkdownInfo = {
        type: "markdown",
        id: `md-new-${nextId}`,
        workspaceId,
        folderId,
        title,
        data: { markdown: "" },
        metadata: {},
        extensions: {},
        createdAt: nextId,
        updatedAt: nextId,
      };
      nextId += 1;
      notes.push(item);
      bodies.set(item.id, "");
      return item;
    },
    queueMarkdownContent(id, markdown) {
      bodies.set(id, markdown);
    },
    flushMarkdownContent(id) {
      const item = notes.find((note) => note.id === id);
      if (!item) throw new Error(`Missing markdown "${id}".`);
      item.data = { markdown: bodies.get(id) ?? "" };
      return item;
    },
  };

  return { chatTree, notes, folders, bodies };
}

describe("importMarkdownNotesFromDirectory", () => {
  it("creates new items whose data.markdown equals exported file text", async () => {
    const body = "# Title\n\nLine with trailing spaces  \n\n```\ncode\n```\n\n日本語\n";
    const originalIds = ["md-existing-1", "md-existing-2"];
    const dest = await makeTempDir();
    const exported = await writeNotesFolderExportPlan(
      dest,
      buildNotesFolderExportPlan({
        workspaceId: "workspace-1",
        rootFolders: [
          {
            id: "folder-1",
            workspaceId: "workspace-1",
            parentId: null,
            name: "Chapters",
            createdAt: 1,
            updatedAt: 1,
            folders: [],
            items: [
              {
                type: "markdown",
                id: originalIds[0]!,
                workspaceId: "workspace-1",
                folderId: "folder-1",
                title: "One",
                data: { markdown: body },
                metadata: {},
                extensions: {},
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        ],
        rootItems: [
          {
            type: "markdown",
            id: originalIds[1]!,
            workspaceId: "workspace-1",
            folderId: null,
            title: "Loose note",
            data: { markdown: "second" },
            metadata: {},
            extensions: {},
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    const tree = memoryTree();
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", exported);
    const importedBodies = tree.notes
      .map((note) => note.data.markdown)
      .sort((left, right) => left.localeCompare(right));

    expect(importedBodies).toEqual([body, "second"].sort((left, right) => (left < right ? -1 : 1)));
    expect(tree.notes.every((note) => !originalIds.includes(note.id))).toBe(true);

    const again = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", exported);
    expect(again.noteCount).toBe(2);
    expect(tree.notes).toHaveLength(4);
    expect(
      tree.notes.map((note) => note.data.markdown).filter((text) => text === body),
    ).toHaveLength(2);
    expect(result.skippedCount).toBe(0);
  });

  it("summarizes oversized files and ignored non-markdown and vault dirs", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, ".obsidian"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(join(root, "Empty"), { recursive: true });
    await writeFile(join(root, ".obsidian", "note.md"), "vault", "utf8");
    await writeFile(join(root, ".git", "HEAD.md"), "git", "utf8");
    await writeFile(join(root, "ok.md"), "kept", "utf8");
    await writeFile(join(root, "skip.txt"), "nope", "utf8");
    await writeFile(join(root, "huge.md"), "x".repeat(MAX_MARKDOWN_FILE_BYTES + 1), "utf8");

    const tree = memoryTree();
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root);

    expect(tree.notes.map((note) => note.data.markdown)).toEqual(["kept"]);
    expect(tree.folders).toHaveLength(0);
    expect(result.skippedOversizedCount).toBe(1);
    expect(result.ignoredNonMarkdownCount).toBe(1);
    expect(result.ignoredDirectoryNames).toEqual([".git", ".obsidian"]);
    expect(formatNotesFolderImportSummary(result)).toBe(
      `1 note added from ${root}. 1 oversized file skipped. 1 non-markdown file ignored. Ignored .git/, .obsidian/. huge.md is larger than 5 MiB and was skipped.`,
    );
  });
});
