import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo, MarkdownInfo } from "@shared/ipc";
import { MAX_MARKDOWN_FILE_BYTES } from "@shared/markdown/content";
import { DEFAULT_MARKDOWN_TITLE } from "@shared/markdown/title-source";

import {
  buildNotesFolderExportPlan,
  collectMarkdownFiles,
  titleFromMarkdownFileName,
  writeNotesFolderExportPlan,
} from "./serialize";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hanoki-notes-io-"));
  tempDirs.push(dir);
  return dir;
}

function markdownItem(
  overrides: Partial<MarkdownInfo> & Pick<MarkdownInfo, "id" | "title">,
): MarkdownInfo {
  return {
    type: "markdown",
    workspaceId: "workspace-1",
    folderId: null,
    data: { markdown: "" },
    metadata: {},
    extensions: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function folderNode(
  overrides: Partial<ChatTreeFolderNode> & Pick<ChatTreeFolderNode, "id" | "name">,
): ChatTreeFolderNode {
  return {
    workspaceId: "workspace-1",
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    folders: [],
    items: [],
    ...overrides,
  };
}

function snapshot(partial: Partial<ChatTreeSnapshot> = {}): ChatTreeSnapshot {
  return {
    workspaceId: "workspace-1",
    rootFolders: [],
    rootItems: [],
    ...partial,
  };
}

describe("buildNotesFolderExportPlan", () => {
  it("writes nested folders, skips chats and terminals, and disambiguates collisions", () => {
    const chat: ItemInfo = {
      type: "chat",
      id: "chat-1",
      workspaceId: "workspace-1",
      folderId: "folder-drafts",
      title: "Ignored chat",
      data: { settings: {} },
      metadata: {},
      extensions: {},
      createdAt: 1,
      updatedAt: 1,
    };
    const terminal: ItemInfo = {
      type: "terminal",
      id: "term-1",
      workspaceId: "workspace-1",
      folderId: null,
      title: "Ignored terminal",
      data: {
        workingDirectory: "/",
        shell: "zsh",
        columns: 80,
        rows: 24,
        scrollback: "",
        scrollbackVersion: 2,
      },
      metadata: {},
      extensions: {},
      createdAt: 1,
      updatedAt: 1,
    };

    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootFolders: [
          folderNode({
            id: "folder-drafts",
            name: "Drafts",
            items: [
              markdownItem({
                id: "md-1",
                folderId: "folder-drafts",
                title: "Scene",
                data: { markdown: "Once upon a time.\n" },
              }),
              markdownItem({
                id: "md-2",
                folderId: "folder-drafts",
                title: "Scene",
                data: { markdown: "A colliding scene." },
              }),
              chat,
            ],
            folders: [
              folderNode({
                id: "folder-empty",
                name: "Empty",
                parentId: "folder-drafts",
              }),
            ],
          }),
        ],
        rootItems: [
          markdownItem({
            id: "md-root",
            title: "Hello/World:Note?",
            data: { markdown: "# Hello\n\nBody with 日本語 and emoji 🌲.\n" },
          }),
          terminal,
        ],
      }),
    );

    expect(plan.directories).toEqual(["Drafts", "Drafts/Empty"]);
    expect(plan.files).toEqual([
      { relativePath: "Drafts/Scene.md", body: "Once upon a time.\n" },
      { relativePath: "Drafts/Scene-2.md", body: "A colliding scene." },
      { relativePath: "Hello-World-Note.md", body: "# Hello\n\nBody with 日本語 and emoji 🌲.\n" },
    ]);
  });
});

describe("notes folder round-trip", () => {
  it("preserves markdown body characters exactly", async () => {
    const body = "# Title\n\nLine with trailing spaces  \n\n```\ncode\n```\n\n日本語\n";
    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootFolders: [
          folderNode({
            id: "folder-1",
            name: "Chapters",
            items: [
              markdownItem({
                id: "md-1",
                folderId: "folder-1",
                title: "One",
                data: { markdown: body },
              }),
            ],
          }),
        ],
        rootItems: [
          markdownItem({
            id: "md-2",
            title: "Loose note",
            data: { markdown: "" },
          }),
        ],
      }),
    );

    const dest = await makeTempDir();
    await writeNotesFolderExportPlan(dest, plan);
    const collected = await collectMarkdownFiles(dest);

    expect(await readFile(join(dest, "Chapters", "One.md"), "utf8")).toBe(body);
    expect(
      [...collected.files].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      ),
    ).toEqual([
      {
        relativePath: "Chapters/One.md",
        folderSegments: ["Chapters"],
        title: "One",
        body,
      },
      {
        relativePath: "Loose note.md",
        folderSegments: [],
        title: "Loose note",
        body: "",
      },
    ]);
    expect(collected.skipped).toEqual([]);
  });

  it("ignores .obsidian, .git, non-markdown files, and oversized notes", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, ".obsidian"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(join(root, "Keep"), { recursive: true });
    await writeFile(join(root, ".obsidian", "note.md"), "vault config", "utf8");
    await writeFile(join(root, ".git", "HEAD.md"), "git", "utf8");
    await writeFile(join(root, "Keep", "ok.md"), "kept", "utf8");
    await writeFile(join(root, "Keep", "skip.txt"), "nope", "utf8");
    await writeFile(join(root, "huge.md"), "x".repeat(MAX_MARKDOWN_FILE_BYTES + 1), "utf8");

    const collected = await collectMarkdownFiles(root);
    expect(collected.files).toEqual([
      {
        relativePath: "Keep/ok.md",
        folderSegments: ["Keep"],
        title: "ok",
        body: "kept",
      },
    ]);
    expect(collected.skipped).toEqual([
      {
        relativePath: "huge.md",
        reason: "huge.md is larger than 5 MiB and was skipped.",
      },
    ]);
  });
});

describe("titleFromMarkdownFileName", () => {
  it("strips the extension and uses a fallback for empty names", () => {
    expect(titleFromMarkdownFileName("Scene 1.md")).toBe("Scene 1");
    expect(titleFromMarkdownFileName(".md")).toBe(DEFAULT_MARKDOWN_TITLE);
    expect(titleFromMarkdownFileName("NOTE.MD")).toBe("NOTE");
  });
});
