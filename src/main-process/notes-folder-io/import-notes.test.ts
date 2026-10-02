import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { FolderInfo, MarkdownInfo } from "@shared/ipc";
import {
  NOTES_FOLDER_REIMPORT_NOTE,
  formatNotesFolderImportSummary,
} from "@shared/markdown/folder-io";
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

type StoredNote = MarkdownInfo & { importRelativePath: string | null };

function memoryTree() {
  const notes: StoredNote[] = [];
  const folders: FolderInfo[] = [];
  let nextId = 1;
  const bodies = new Map<string, string>();

  const chatTree: NotesFolderImportTree = {
    listChildFolders(workspaceId, parentId) {
      return folders
        .filter((folder) => folder.workspaceId === workspaceId && folder.parentId === parentId)
        .map((folder) => ({ id: folder.id, name: folder.name }));
    },
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
    deleteFolder(id) {
      const drop = new Set<string>();
      const walk = (folderId: string) => {
        drop.add(folderId);
        for (const folder of folders) {
          if (folder.parentId === folderId) walk(folder.id);
        }
      };
      walk(id);
      for (let index = folders.length - 1; index >= 0; index -= 1) {
        if (drop.has(folders[index]!.id)) folders.splice(index, 1);
      }
      for (let index = notes.length - 1; index >= 0; index -= 1) {
        const folderId = notes[index]!.folderId;
        if (folderId && drop.has(folderId)) notes.splice(index, 1);
      }
    },
    createMarkdown({ workspaceId, title, folderId, importRelativePath }) {
      const item: StoredNote = {
        type: "markdown",
        id: `md-new-${nextId}`,
        workspaceId,
        folderId,
        title,
        importRelativePath: importRelativePath ?? null,
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

function wrapFolders(folders: readonly FolderInfo[]): FolderInfo[] {
  const parent = folders.find((folder) => folder.parentId === null && folder.name === "Imported");
  if (!parent) return [];
  return folders.filter((folder) => folder.parentId === parent.id);
}

describe("importMarkdownNotesFromDirectory", () => {
  it("wraps a one-shot copy and keeps bodies and vault paths", async () => {
    const body = "---\ntitle: One\n---\n\n[[Projects/Alpha#Heading|shown]]\n";
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
    const vaultName = basename(exported);

    expect(result.wrapFolderPath).toBe(`Imported/${vaultName}`);
    expect(wrapFolders(tree.folders).map((folder) => folder.name)).toEqual([vaultName]);
    expect(tree.notes.map((note) => note.importRelativePath).sort()).toEqual([
      "Chapters/One",
      "Loose note",
    ]);
    expect(tree.notes.map((note) => note.data.markdown).sort()).toEqual([body, "second"].sort());
    expect(tree.notes.every((note) => !originalIds.includes(note.id))).toBe(true);
    expect(tree.notes.some((note) => note.data.markdown.includes("hanoki_id"))).toBe(false);

    const again = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", exported);
    const wraps = wrapFolders(tree.folders);
    expect(again.noteCount).toBe(2);
    expect(again.wrapFolderPath).not.toBe(result.wrapFolderPath);
    expect(wraps).toHaveLength(2);
    expect(wraps.map((folder) => folder.name)).toContain(vaultName);
    expect(tree.notes).toHaveLength(4);
    expect(result.skippedCount).toBe(0);
    expect(result.canceled).toBe(false);
  });

  it("strips a UTF-8 BOM and leaves the rest of the file untouched", async () => {
    const root = await makeTempDir();
    const body = "---\nkeep: true\n---\n[[Note]]\n";
    await writeFile(
      join(root, "Note.md"),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]),
    );

    const tree = memoryTree();
    await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root);

    expect(tree.notes).toHaveLength(1);
    expect(tree.notes[0]?.data.markdown).toBe(body);
    expect(tree.notes[0]?.importRelativePath).toBe("Note");
  });

  it("skips duplicate paths, including names that differ only by case", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "Notes"), { recursive: true });
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "Notes", "A.md"), "upper", "utf8");
    await writeFile(join(root, "notes", "a.md"), "lower", "utf8");
    await writeFile(join(root, "Other.md"), "kept", "utf8");

    const tree = memoryTree();
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root);

    expect(result.noteCount).toBe(2);
    expect(result.skippedDuplicatePathCount).toBe(1);
    expect(result.skippedPaths.map((path) => path.toLowerCase())).toEqual(["notes/a.md"]);
    expect(tree.notes.map((note) => note.importRelativePath?.toLowerCase()).sort()).toEqual([
      "notes/a",
      "other",
    ]);
  });

  it("summarizes an empty vault without failing", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, ".obsidian"), { recursive: true });
    await writeFile(join(root, ".obsidian", "note.md"), "vault", "utf8");
    await writeFile(join(root, "skip.txt"), "nope", "utf8");

    const tree = memoryTree();
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root);

    expect(result.noteCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.ignoredNonMarkdownCount).toBe(1);
    expect(result.ignoredDirectoryNames).toEqual([".obsidian"]);
    expect(result.wrapFolderPath).toBe(`Imported/${basename(root)}`);
    expect(formatNotesFolderImportSummary(result)).toContain("New 0 · Skip 0 · Fail 0.");
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
    expect(tree.notes[0]?.importRelativePath).toBe("ok");
    expect(wrapFolders(tree.folders)).toHaveLength(1);
    expect(result.skippedOversizedCount).toBe(1);
    expect(result.ignoredNonMarkdownCount).toBe(1);
    expect(result.ignoredDirectoryNames).toEqual([".git", ".obsidian"]);
    expect(formatNotesFolderImportSummary(result)).toBe(
      `New 1 · Skip 1 · Fail 0. Copied under Imported/${basename(root)}. ${NOTES_FOLDER_REIMPORT_NOTE} 1 non-markdown file ignored. Ignored .git/, .obsidian/. huge.md is larger than 5 MiB and was skipped.`,
    );
  });

  it("drops the empty wrap when cancel happens before any note is copied", async () => {
    const root = await makeTempDir();
    await writeFile(join(root, "A.md"), "a", "utf8");

    const tree = memoryTree();
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root, {
      isCanceled: () => true,
    });

    expect(result.canceled).toBe(true);
    expect(result.noteCount).toBe(0);
    expect(tree.notes).toHaveLength(0);
    expect(tree.folders).toHaveLength(0);
    expect(formatNotesFolderImportSummary(result)).toBe("Import canceled. Nothing was copied.");
  });

  it("stops on cancel and keeps notes already copied", async () => {
    const root = await makeTempDir();
    await writeFile(join(root, "A.md"), "a", "utf8");
    await writeFile(join(root, "B.md"), "b", "utf8");
    await writeFile(join(root, "C.md"), "c", "utf8");

    const tree = memoryTree();
    let checks = 0;
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root, {
      isCanceled: () => {
        checks += 1;
        return checks > 1;
      },
    });

    expect(result.canceled).toBe(true);
    expect(result.noteCount).toBe(1);
    expect(tree.notes).toHaveLength(1);
    expect(formatNotesFolderImportSummary(result)).toContain("Partial copy kept.");
  });

  it("stops when cancel is scheduled while the import yields", async () => {
    const root = await makeTempDir();
    for (let index = 0; index < 40; index += 1) {
      await writeFile(join(root, `N${String(index).padStart(2, "0")}.md`), "x", "utf8");
    }

    const tree = memoryTree();
    let cancel = false;
    let scheduled = false;
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root, {
      isCanceled: () => cancel,
      onProgress: () => {
        if (scheduled) return;
        scheduled = true;
        setImmediate(() => {
          cancel = true;
        });
      },
    });

    expect(result.canceled).toBe(true);
    expect(result.noteCount).toBe(25);
    expect(formatNotesFolderImportSummary(result)).toContain("Partial copy kept.");
  });

  it("counts invalid UTF-8 as a failure and ignores .trash", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, ".trash"), { recursive: true });
    await writeFile(join(root, ".trash", "Gone.md"), "gone", "utf8");
    await writeFile(join(root, "bad.md"), Buffer.from([0xff, 0xfe, 0x41, 0x00]));
    await writeFile(join(root, "ok.md"), "ok", "utf8");

    const tree = memoryTree();
    const result = await importMarkdownNotesFromDirectory(tree.chatTree, "workspace-1", root);

    expect(result.noteCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ relativePath: "bad.md", reason: expect.stringContaining("UTF-8") }),
    ]);
    expect(result.ignoredDirectoryNames).toEqual([".trash"]);
    expect(tree.notes.map((note) => note.data.markdown)).toEqual(["ok"]);
  });
});
