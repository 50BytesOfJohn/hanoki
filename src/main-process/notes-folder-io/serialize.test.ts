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
          markdownItem({
            id: "md-con",
            title: "CON",
            data: { markdown: "reserved name" },
          }),
          terminal,
        ],
      }),
    );

    expect(plan.directories).toEqual(["Drafts"]);
    expect(plan.skippedNonMarkdownCount).toBe(2);
    expect(plan.files).toEqual([
      { relativePath: "Drafts/Scene.md", body: "Once upon a time.\n" },
      { relativePath: "Drafts/Scene-2.md", body: "A colliding scene." },
      { relativePath: "Hello-World-Note.md", body: "# Hello\n\nBody with 日本語 and emoji 🌲.\n" },
      { relativePath: "CON-file.md", body: "reserved name" },
    ]);
  });

  it("exports folders that contain markdown descendants and skips empty ones", () => {
    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootFolders: [
          folderNode({
            id: "folder-archive",
            name: "Archive",
            folders: [
              folderNode({
                id: "folder-year",
                name: "2024",
                parentId: "folder-archive",
                items: [
                  markdownItem({
                    id: "md-nested",
                    folderId: "folder-year",
                    title: "Kept",
                    data: { markdown: "nested" },
                  }),
                ],
              }),
              folderNode({
                id: "folder-empty",
                name: "Empty",
                parentId: "folder-archive",
              }),
            ],
          }),
          folderNode({
            id: "folder-chats",
            name: "Chats only",
            items: [
              {
                type: "chat",
                id: "chat-1",
                workspaceId: "workspace-1",
                folderId: "folder-chats",
                title: "Chat",
                data: { settings: {} },
                metadata: {},
                extensions: {},
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          }),
        ],
      }),
    );

    expect(plan.directories).toEqual(["Archive", "Archive/2024"]);
    expect(plan.files).toEqual([{ relativePath: "Archive/2024/Kept.md", body: "nested" }]);
    expect(plan.skippedNonMarkdownCount).toBe(1);
  });

  it("disambiguates duplicate sibling folder names as Notes and Notes-2", () => {
    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootFolders: [
          folderNode({
            id: "folder-notes-1",
            name: "Notes",
            items: [
              markdownItem({
                id: "md-a",
                folderId: "folder-notes-1",
                title: "A",
                data: { markdown: "first" },
              }),
            ],
          }),
          folderNode({
            id: "folder-notes-2",
            name: "Notes",
            items: [
              markdownItem({
                id: "md-b",
                folderId: "folder-notes-2",
                title: "B",
                data: { markdown: "second" },
              }),
            ],
          }),
        ],
      }),
    );

    expect(plan.directories).toEqual(["Notes", "Notes-2"]);
    expect(plan.files).toEqual([
      { relativePath: "Notes/A.md", body: "first" },
      { relativePath: "Notes-2/B.md", body: "second" },
    ]);
  });

  it("writes the stored items.data.markdown bytes, not a re-serialized editor view", () => {
    const stored = "# Title\n\nTrailing spaces  \n\n<div>raw html</div>\n";
    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootItems: [
          markdownItem({
            id: "md-raw",
            title: "Raw",
            data: { markdown: stored },
          }),
        ],
      }),
    );
    expect(plan.files).toEqual([{ relativePath: "Raw.md", body: stored }]);
  });
});

describe("notes folder round-trip", () => {
  it("preserves exported markdown text as imported body, not item identity", async () => {
    const body = "# Title\n\nLine with trailing spaces  \n\n```\ncode\n```\n\n日本語\n";
    const originalIds = ["md-1", "md-2"];
    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootFolders: [
          folderNode({
            id: "folder-1",
            name: "Chapters",
            items: [
              markdownItem({
                id: originalIds[0],
                folderId: "folder-1",
                title: "One",
                data: { markdown: body },
              }),
            ],
          }),
        ],
        rootItems: [
          markdownItem({
            id: originalIds[1],
            title: "Loose note",
            data: { markdown: "" },
          }),
        ],
      }),
    );

    const dest = await makeTempDir();
    await writeNotesFolderExportPlan(dest, plan);
    const collected = await collectMarkdownFiles(dest);
    const exportedBodies = [...plan.files]
      .map((file) => file.body)
      .sort((left, right) => left.localeCompare(right));
    const importedBodies = [...collected.files]
      .map((file) => file.body)
      .sort((left, right) => left.localeCompare(right));

    expect(importedBodies).toEqual(exportedBodies);
    expect(collected.skipped).toEqual([]);
  });

  it("writes UTF-8 without BOM and strips a leading BOM on import", async () => {
    const dest = await makeTempDir();
    await writeNotesFolderExportPlan(dest, {
      directories: [],
      files: [{ relativePath: "Note.md", body: "café" }],
      skippedNonMarkdownCount: 0,
    });
    const written = await readFile(join(dest, "Note.md"));
    expect(written.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(written.toString("utf8")).toBe("café");

    const bomRoot = await makeTempDir();
    await writeFile(
      join(bomRoot, "bom.md"),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("café", "utf8")]),
    );
    const collected = await collectMarkdownFiles(bomRoot);
    expect(collected.files.map((file) => file.body)).toEqual(["café"]);
  });

  it("records oversized files and ignored non-markdown, .obsidian/, and .git/", async () => {
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
    expect(collected.files.map((file) => file.body)).toEqual(["kept"]);
    expect(
      [...collected.skipped].sort((left, right) =>
        left.relativePath < right.relativePath ? -1 : 1,
      ),
    ).toEqual([
      { relativePath: ".git", kind: "ignored-directory" },
      { relativePath: ".obsidian", kind: "ignored-directory" },
      { relativePath: "Keep/skip.txt", kind: "non-markdown" },
      {
        relativePath: "huge.md",
        kind: "oversized",
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

  it("is best-effort: a truncated filename cannot restore a longer original title", () => {
    const originalTitle = "n".repeat(200);
    const plan = buildNotesFolderExportPlan(
      snapshot({
        rootItems: [
          markdownItem({
            id: "md-long",
            title: originalTitle,
            data: { markdown: "body" },
          }),
        ],
      }),
    );
    expect(plan.files).toEqual([{ relativePath: `${"n".repeat(120)}.md`, body: "body" }]);
    expect(titleFromMarkdownFileName(`${"n".repeat(120)}.md`)).toBe("n".repeat(120));
    expect(titleFromMarkdownFileName(`${"n".repeat(120)}.md`)).not.toBe(originalTitle);
  });
});
