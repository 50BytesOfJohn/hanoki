import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { closeAppDatabase, getAppDatabase } from "../db/database";
import { upsertMessage } from "../messages/repository";
import { createHanokiTools } from "../server/assistant/hanoki-tools";
import { createWorkspace } from "../workspaces/repository";
import {
  createChat,
  createFolder,
  getChatById,
  getChatTreeChildren,
  getFolderById,
  moveChatTreeItems,
  searchWorkspaceChats,
} from "./repository";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-move-items-"));

beforeAll(() => {
  process.env["HANOKI_USER_DATA_DIR"] = testDataDirectory;
  const db = getAppDatabase();
  db.run(
    sql.raw(`
    create table workspaces (
      id text primary key,
      name text not null,
      color text,
      settings text not null default '{}',
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table folders (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      parent_id text references folders(id) on delete set null,
      name text not null,
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table chats (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      folder_id text references folders(id) on delete set null,
      title text not null,
      settings text not null default '{}',
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table messages (
      id text primary key,
      chat_id text not null references chats(id) on delete cascade,
      parent_id text references messages(id) on delete set null,
      role text not null,
      parts text not null default '[]',
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
  delete process.env["HANOKI_USER_DATA_DIR"];
});

describe("moveChatTreeItems", () => {
  it("moves mixed items once and preserves selected folder subtrees", () => {
    createWorkspace({ id: "workspace", name: "Workspace" });
    const destination = createFolder({ workspaceId: "workspace", name: "Done", parentId: null });
    const parent = createFolder({ workspaceId: "workspace", name: "Parent", parentId: null });
    const child = createFolder({ workspaceId: "workspace", name: "Child", parentId: parent.id });
    const nestedChat = createChat({
      workspaceId: "workspace",
      title: "Nested",
      folderId: child.id,
    });
    const rootChat = createChat({ workspaceId: "workspace", title: "Root", folderId: null });

    const result = moveChatTreeItems(
      "workspace",
      [
        { kind: "folder", id: parent.id },
        { kind: "folder", id: child.id },
        { kind: "chat", id: nestedChat.id },
        { kind: "chat", id: rootChat.id },
        { kind: "chat", id: rootChat.id },
      ],
      destination.id,
    );

    expect(result.movedItems).toEqual([
      { kind: "folder", id: parent.id },
      { kind: "chat", id: rootChat.id },
    ]);
    expect(result.skippedItems.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: "folder", id: child.id },
      { kind: "chat", id: nestedChat.id },
    ]);
    expect(getFolderById(parent.id)?.parentId).toBe(destination.id);
    expect(getFolderById(child.id)?.parentId).toBe(parent.id);
    expect(getChatById(nestedChat.id)?.folderId).toBe(child.id);
    expect(getChatById(rootChat.id)?.folderId).toBe(destination.id);
  });
});

describe("createFolder", () => {
  it("creates a folder inside another workspace folder", () => {
    createWorkspace({ id: "folder-workspace", name: "Folders" });
    const parent = createFolder({
      workspaceId: "folder-workspace",
      name: "Archive",
      parentId: null,
    });

    const folder = createFolder({
      workspaceId: "folder-workspace",
      name: "2026",
      parentId: parent.id,
    });

    expect(getFolderById(folder.id)).toEqual(expect.objectContaining({ parentId: parent.id }));
  });
});

describe("Hanoki tool nullable inputs", () => {
  it("treats empty IDs and cursors as null and allows omitted pagination", async () => {
    createWorkspace({ id: "tool-input-workspace", name: "Tool inputs" });
    const parent = createFolder({
      workspaceId: "tool-input-workspace",
      name: "Parent",
      parentId: null,
    });
    const chat = createChat({
      workspaceId: "tool-input-workspace",
      title: "Chat",
      folderId: parent.id,
    });
    upsertMessage({
      id: "tool-input-message",
      chatId: chat.id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "Search me" }],
      metadata: { parentId: null },
    });
    const tools = createHanokiTools("tool-input-workspace");
    const options = { toolCallId: "test", messages: [], context: undefined as never };

    await tools.hanokiBrowseItems.execute!({ parentFolderId: "", kind: "all", limit: 10 }, options);
    await tools.hanokiSearchChats.execute!({ query: "Search me", limit: 10, cursor: "" }, options);
    await tools.hanokiGetChatContent.execute!({ chatId: chat.id, limit: 10 }, options);
    await tools.hanokiGetChatContent.execute!(
      { chatId: chat.id, limit: 10, beforeMessageId: "" },
      options,
    );
    await tools.hanokiCreateFolder.execute!(
      { name: "Created at root", parentFolderId: "" },
      options,
    );
    await tools.hanokiMoveItems.execute!(
      { items: [{ kind: "chat", id: chat.id }], destinationFolderId: "" },
      options,
    );

    expect(getChatById(chat.id)?.folderId).toBeNull();
    expect(
      getChatTreeChildren("tool-input-workspace", null).folders.some(
        (folder) => folder.name === "Created at root",
      ),
    ).toBe(true);
  });
});

describe("searchWorkspaceChats", () => {
  it("finds chat message content in SQLite", () => {
    createWorkspace({ id: "search-workspace", name: "Search" });
    const chat = createChat({
      workspaceId: "search-workspace",
      title: "Unrelated title",
      folderId: null,
    });
    upsertMessage({
      id: "search-message",
      chatId: chat.id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "A uniquely searchable phrase" }],
      metadata: { parentId: null },
    });

    expect(searchWorkspaceChats("search-workspace", "searchable phrase", 10, 0)).toEqual([
      expect.objectContaining({ id: chat.id }),
    ]);
  });
});
