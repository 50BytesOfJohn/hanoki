import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    expect(await readFile(join(dest, "Stored.md"), "utf8")).toBe(storedBody);
  });
});
