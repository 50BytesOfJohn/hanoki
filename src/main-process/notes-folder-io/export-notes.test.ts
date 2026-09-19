import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ChatTreeSnapshot } from "@shared/ipc";

import { exportMarkdownNotesToDirectory, type NotesFolderExportTree } from "./export-notes";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("exportMarkdownNotesToDirectory", () => {
  it("flushes pending markdown before reading the stored SQLite body", async () => {
    const dest = await mkdtemp(join(tmpdir(), "hanoki-notes-export-"));
    tempDirs.push(dest);
    const calls: string[] = [];
    const storedBody = "raw stored  \n\n<!-- not normalized -->\n";
    const snapshot: ChatTreeSnapshot = {
      workspaceId: "workspace-1",
      rootFolders: [],
      rootItems: [
        {
          type: "markdown",
          id: "md-1",
          workspaceId: "workspace-1",
          folderId: null,
          title: "Stored",
          data: { markdown: storedBody },
          metadata: {},
          extensions: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const chatTree: NotesFolderExportTree = {
      flushAllMarkdownContent() {
        calls.push("flush");
      },
      getChatTree(workspaceId) {
        calls.push(`tree:${workspaceId}`);
        return snapshot;
      },
    };

    const result = await exportMarkdownNotesToDirectory(chatTree, "workspace-1", dest);

    expect(calls).toEqual(["flush", "tree:workspace-1"]);
    expect(result.noteCount).toBe(1);
    expect(result.folderPath).toBe(dest);
    expect(await readFile(join(dest, "Stored.md"), "utf8")).toBe(storedBody);
  });

  it("reports a nested folderPath when the picked directory is not empty", async () => {
    const dest = await mkdtemp(join(tmpdir(), "hanoki-notes-export-"));
    tempDirs.push(dest);
    await writeFile(join(dest, "keep.txt"), "untouched");
    const snapshot: ChatTreeSnapshot = {
      workspaceId: "workspace-1",
      rootFolders: [],
      rootItems: [
        {
          type: "markdown",
          id: "md-1",
          workspaceId: "workspace-1",
          folderId: null,
          title: "Stored",
          data: { markdown: "body" },
          metadata: {},
          extensions: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const chatTree: NotesFolderExportTree = {
      flushAllMarkdownContent() {},
      getChatTree() {
        return snapshot;
      },
    };

    const result = await exportMarkdownNotesToDirectory(chatTree, "workspace-1", dest);

    expect(result.folderPath).not.toBe(dest);
    expect(result.folderPath).toMatch(/Hanoki Notes Export \d{4}-\d{2}-\d{2}$/);
    expect(await readFile(join(dest, "keep.txt"), "utf8")).toBe("untouched");
    expect(await readFile(join(result.folderPath, "Stored.md"), "utf8")).toBe("body");
  });
});
