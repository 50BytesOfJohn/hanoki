import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { MAX_MARKDOWN_LENGTH } from "@shared/markdown/content";

import { closeAppDatabase, getAppDatabase } from "../db/database";
import { upsertMessage } from "../messages/repository";
import { createHanokiTools, HANOKI_TOOL_NAMES } from "../server/assistant/hanoki-tools";
import { createChatTreeService } from "../services/chat-tree-service";
import { createWorkspace } from "../workspaces/repository";
import {
  createChat,
  createFolder,
  createMarkdown,
  createTerminal,
  getChatById,
  getChatTreeChildren,
  getFolderById,
  getItemById,
  moveChatTreeItems,
  searchWorkspaceChats,
  updateChatSettings,
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
    create table items (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      folder_id text references folders(id) on delete set null,
      type text not null,
      title text not null,
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
      item_id text not null references items(id) on delete cascade,
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
        { kind: "item", id: nestedChat.id },
        { kind: "item", id: rootChat.id },
        { kind: "item", id: rootChat.id },
      ],
      destination.id,
    );

    expect(result.movedItems).toEqual([
      { kind: "folder", id: parent.id },
      { kind: "item", id: rootChat.id },
    ]);
    expect(result.skippedItems.map(({ kind, id }) => ({ kind, id }))).toEqual([
      { kind: "folder", id: child.id },
      { kind: "item", id: nestedChat.id },
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

describe("createMarkdown", () => {
  it("stores Markdown content in the item data object", () => {
    createWorkspace({ id: "markdown-workspace", name: "Markdown" });

    const item = createMarkdown({
      workspaceId: "markdown-workspace",
      title: "New markdown",
      folderId: null,
    });

    expect(item).toEqual(
      expect.objectContaining({
        type: "markdown",
        title: "New markdown",
        data: { markdown: "" },
      }),
    );
  });

  it("persists queued content after the debounce and during an explicit flush", async () => {
    createWorkspace({ id: "markdown-autosave-workspace", name: "Markdown autosave" });
    const service = createChatTreeService();
    const item = service.createMarkdown({
      workspaceId: "markdown-autosave-workspace",
      title: "Autosave",
      folderId: null,
    });

    service.queueMarkdownContent(item.id, "Debounced content");
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(service.getItem(item.id)).toEqual(
      expect.objectContaining({ data: { markdown: "Debounced content" } }),
    );

    service.queueMarkdownContent(item.id, "Flushed content");
    service.flushAllMarkdownContent();
    expect(service.getItem(item.id)).toEqual(
      expect.objectContaining({ data: { markdown: "Flushed content" } }),
    );
  });
});

describe("updateChatSettings", () => {
  it("stores a temperature override and removes the empty model config when reset", () => {
    createWorkspace({ id: "settings-workspace", name: "Settings" });
    const chat = createChat({
      workspaceId: "settings-workspace",
      title: "Configured chat",
      folderId: null,
    });

    expect(
      updateChatSettings(chat.id, {
        modelId: "selected-model",
        systemPrompt: "Be concise.",
        modelConfig: { temperature: 0.4 },
      }).data.settings,
    ).toEqual({
      modelId: "selected-model",
      systemPrompt: "Be concise.",
      modelConfig: { temperature: 0.4 },
    });

    expect(
      updateChatSettings(chat.id, { modelConfig: { temperature: null } }).data.settings,
    ).toEqual({
      modelId: "selected-model",
      systemPrompt: "Be concise.",
    });

    expect(getChatById(chat.id)?.data.settings.modelId).toBe("selected-model");
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
    const tools = createHanokiTools({ workspaceId: "tool-input-workspace", chatId: chat.id });
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
    await tools.hanokiCreateChat.execute!({ title: "Created chat at root", folderId: "" }, options);
    await tools.hanokiCreateMarkdown.execute!(
      { title: "Created note at root", folderId: "", body: "" },
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
    expect(
      getChatTreeChildren("tool-input-workspace", null).items.some(
        (item) => item.type === "chat" && item.title === "Created chat at root",
      ),
    ).toBe(true);
    expect(
      getChatTreeChildren("tool-input-workspace", null).items.some(
        (item) => item.type === "markdown" && item.title === "Created note at root",
      ),
    ).toBe(true);
  });
});

const toolExecuteOptions = {
  toolCallId: "test",
  messages: [],
  // SAFETY: Tool execute() types context as never; tests do not use it.
  context: undefined as never,
};

function unwrapToolResult<T>(value: T): Exclude<T, AsyncIterable<unknown>> {
  if (typeof value === "object" && value !== null && Symbol.asyncIterator in value) {
    throw new Error("Expected a Hanoki tool result object.");
  }
  // SAFETY: Hanoki tools execute as one-shot objects; they never stream.
  return value as Exclude<T, AsyncIterable<unknown>>;
}

describe("Hanoki create and browse kinds", () => {
  it("registers the slice-1 tools on the agent tool map", () => {
    expect(
      Object.keys(createHanokiTools({ workspaceId: "unused-workspace", chatId: "unused-chat" })),
    ).toEqual([...HANOKI_TOOL_NAMES]);
  });

  it("returns the workspace root when the hosting chat is at root", async () => {
    createWorkspace({ id: "current-folder-root", name: "Root" });
    const chat = createChat({
      workspaceId: "current-folder-root",
      title: "Host",
      folderId: null,
    });
    const tools = createHanokiTools({ workspaceId: "current-folder-root", chatId: chat.id });

    expect(
      unwrapToolResult(await tools.hanokiGetCurrentFolder.execute!({}, toolExecuteOptions)),
    ).toEqual({
      workspaceId: "current-folder-root",
      chatId: chat.id,
      folderId: null,
      path: [],
      pathString: "",
    });
  });

  it("returns the nested folder path of the hosting chat", async () => {
    createWorkspace({ id: "current-folder-nested", name: "Nested" });
    const notes = createFolder({
      workspaceId: "current-folder-nested",
      name: "Notes",
      parentId: null,
    });
    const planning = createFolder({
      workspaceId: "current-folder-nested",
      name: "Planning",
      parentId: notes.id,
    });
    const chat = createChat({
      workspaceId: "current-folder-nested",
      title: "Host",
      folderId: planning.id,
    });
    const tools = createHanokiTools({ workspaceId: "current-folder-nested", chatId: chat.id });

    expect(
      unwrapToolResult(await tools.hanokiGetCurrentFolder.execute!({}, toolExecuteOptions)),
    ).toEqual({
      workspaceId: "current-folder-nested",
      chatId: chat.id,
      folderId: planning.id,
      path: [
        { id: notes.id, name: "Notes" },
        { id: planning.id, name: "Planning" },
      ],
      pathString: "Notes/Planning",
    });
  });

  it("fails when the calling chat is missing or in another workspace", async () => {
    createWorkspace({ id: "location-a", name: "A" });
    createWorkspace({ id: "location-b", name: "B" });
    const chatB = createChat({
      workspaceId: "location-b",
      title: "B",
      folderId: null,
    });
    const missing = createHanokiTools({ workspaceId: "location-a", chatId: "no-such-chat" });
    const wrongWorkspace = createHanokiTools({ workspaceId: "location-a", chatId: chatB.id });

    await expect(async () => {
      await missing.hanokiGetCurrentFolder.execute!({}, toolExecuteOptions);
    }).rejects.toThrow('Chat "no-such-chat" does not exist in this workspace.');
    await expect(async () => {
      await wrongWorkspace.hanokiGetCurrentFolder.execute!({}, toolExecuteOptions);
    }).rejects.toThrow(`Chat "${chatB.id}" does not exist in this workspace.`);
  });

  it("caps this chat's folder breadcrumb at 32 folders", async () => {
    createWorkspace({ id: "deep-folder-workspace", name: "Deep" });
    let parentId: string | null = null;
    let deepestId = "";
    for (let index = 0; index < 33; index += 1) {
      const folder = createFolder({
        workspaceId: "deep-folder-workspace",
        name: `L${index}`,
        parentId,
      });
      parentId = folder.id;
      deepestId = folder.id;
    }
    const chat = createChat({
      workspaceId: "deep-folder-workspace",
      title: "Host",
      folderId: deepestId,
    });
    const tools = createHanokiTools({ workspaceId: "deep-folder-workspace", chatId: chat.id });
    const location = unwrapToolResult(
      await tools.hanokiGetCurrentFolder.execute!({}, toolExecuteOptions),
    );

    expect(location.folderId).toBe(deepestId);
    expect(location.path).toHaveLength(32);
    expect(location.path[0]).toEqual(expect.objectContaining({ name: "L1" }));
    expect(location.path[31]).toEqual(expect.objectContaining({ name: "L32" }));
  });

  it("returns the folder location of an explicit chat, note, or terminal", async () => {
    createWorkspace({ id: "item-location-workspace", name: "Item location" });
    const notes = createFolder({
      workspaceId: "item-location-workspace",
      name: "Notes",
      parentId: null,
    });
    const host = createChat({
      workspaceId: "item-location-workspace",
      title: "Host",
      folderId: null,
    });
    const chat = createChat({
      workspaceId: "item-location-workspace",
      title: "Nested chat",
      folderId: notes.id,
    });
    const note = createMarkdown({
      workspaceId: "item-location-workspace",
      title: "Note",
      folderId: notes.id,
    });
    const terminal = createTerminal({
      workspaceId: "item-location-workspace",
      title: "Term",
      folderId: null,
      data: {
        workingDirectory: "/tmp",
        shell: "/bin/sh",
        columns: 80,
        rows: 24,
        scrollback: "",
        scrollbackVersion: 0,
      },
    });
    const tools = createHanokiTools({ workspaceId: "item-location-workspace", chatId: host.id });
    const notesPath = [{ id: notes.id, name: "Notes" }];

    expect(
      unwrapToolResult(
        await tools.hanokiGetItemLocation.execute!({ itemId: chat.id }, toolExecuteOptions),
      ),
    ).toEqual({
      workspaceId: "item-location-workspace",
      itemId: chat.id,
      kind: "chat",
      folderId: notes.id,
      path: notesPath,
      pathString: "Notes",
    });
    expect(
      unwrapToolResult(
        await tools.hanokiGetItemLocation.execute!({ itemId: note.id }, toolExecuteOptions),
      ),
    ).toEqual({
      workspaceId: "item-location-workspace",
      itemId: note.id,
      kind: "markdown",
      folderId: notes.id,
      path: notesPath,
      pathString: "Notes",
    });
    expect(
      unwrapToolResult(
        await tools.hanokiGetItemLocation.execute!({ itemId: terminal.id }, toolExecuteOptions),
      ),
    ).toEqual({
      workspaceId: "item-location-workspace",
      itemId: terminal.id,
      kind: "terminal",
      folderId: null,
      path: [],
      pathString: "",
    });
  });

  it("creates chats and markdown notes, including an optional note body", async () => {
    createWorkspace({ id: "create-tools-workspace", name: "Create tools" });
    const folder = createFolder({
      workspaceId: "create-tools-workspace",
      name: "Notes",
      parentId: null,
    });
    const onTreeChanged = vi.fn();
    const tools = createHanokiTools({
      workspaceId: "create-tools-workspace",
      chatId: "unused-chat",
      onTreeChanged,
    });

    const chat = unwrapToolResult(
      await tools.hanokiCreateChat.execute!(
        { title: "  Planning  ", folderId: folder.id },
        toolExecuteOptions,
      ),
    );
    const emptyNote = unwrapToolResult(
      await tools.hanokiCreateMarkdown.execute!(
        { title: "Empty", folderId: null },
        toolExecuteOptions,
      ),
    );
    const filledNote = unwrapToolResult(
      await tools.hanokiCreateMarkdown.execute!(
        { title: "Filled", folderId: folder.id, body: "# Hello" },
        toolExecuteOptions,
      ),
    );

    expect(chat).toEqual(
      expect.objectContaining({
        kind: "chat",
        name: "Planning",
        parentFolderId: folder.id,
        path: "Notes/Planning",
      }),
    );
    expect(getChatById(chat.id)?.title).toBe("Planning");
    expect(getItemById(emptyNote.id)).toEqual(
      expect.objectContaining({ type: "markdown", folderId: null, data: { markdown: "" } }),
    );
    expect(getItemById(filledNote.id)).toEqual(
      expect.objectContaining({
        type: "markdown",
        folderId: folder.id,
        data: { markdown: "# Hello" },
      }),
    );
    expect(onTreeChanged).toHaveBeenCalledTimes(3);
  });

  it("rejects an oversized markdown body without creating a note", async () => {
    createWorkspace({ id: "oversized-markdown-workspace", name: "Oversized" });
    const onTreeChanged = vi.fn();
    const tools = createHanokiTools({
      workspaceId: "oversized-markdown-workspace",
      chatId: "unused-chat",
      onTreeChanged,
    });

    await expect(async () => {
      await tools.hanokiCreateMarkdown.execute!(
        {
          title: "Too big",
          folderId: null,
          body: "x".repeat(MAX_MARKDOWN_LENGTH + 1),
        },
        toolExecuteOptions,
      );
    }).rejects.toThrow("Markdown content must be a string no larger than 5 MiB.");

    expect(getChatTreeChildren("oversized-markdown-workspace", null).items).toEqual([]);
    expect(onTreeChanged).not.toHaveBeenCalled();
  });

  it("rejects a move when the claimed kind does not match the item", async () => {
    createWorkspace({ id: "move-kind-workspace", name: "Move kind" });
    const destination = createFolder({
      workspaceId: "move-kind-workspace",
      name: "Archive",
      parentId: null,
    });
    const chat = createChat({
      workspaceId: "move-kind-workspace",
      title: "Chat",
      folderId: null,
    });
    const tools = createHanokiTools({ workspaceId: "move-kind-workspace", chatId: chat.id });

    await expect(async () => {
      await tools.hanokiMoveItems.execute!(
        {
          items: [{ kind: "markdown", id: chat.id }],
          destinationFolderId: destination.id,
        },
        toolExecuteOptions,
      );
    }).rejects.toThrow(`Item "${chat.id}" is not a markdown.`);

    expect(getChatById(chat.id)?.folderId).toBeNull();
  });

  it("browses, renames, and moves markdown and terminal items with chats", async () => {
    createWorkspace({ id: "browse-kinds-workspace", name: "Browse kinds" });
    createFolder({
      workspaceId: "browse-kinds-workspace",
      name: "Inbox",
      parentId: null,
    });
    const destination = createFolder({
      workspaceId: "browse-kinds-workspace",
      name: "Archive",
      parentId: null,
    });
    const chat = createChat({
      workspaceId: "browse-kinds-workspace",
      title: "Chat",
      folderId: null,
    });
    const note = createMarkdown({
      workspaceId: "browse-kinds-workspace",
      title: "Note",
      folderId: null,
    });
    const terminal = createTerminal({
      workspaceId: "browse-kinds-workspace",
      title: "Shell",
      folderId: null,
      data: {
        workingDirectory: "/tmp",
        shell: "/bin/sh",
        columns: 80,
        rows: 24,
        scrollback: "",
        scrollbackVersion: 0,
      },
    });
    const tools = createHanokiTools({
      workspaceId: "browse-kinds-workspace",
      chatId: "unused-chat",
    });

    const allRoot = unwrapToolResult(
      await tools.hanokiBrowseItems.execute!(
        { parentFolderId: null, kind: "all", limit: 20 },
        toolExecuteOptions,
      ),
    );
    expect(allRoot.items.map((item) => ({ kind: item.kind, name: item.name }))).toEqual(
      expect.arrayContaining([
        { kind: "folder", name: "Inbox" },
        { kind: "folder", name: "Archive" },
        { kind: "chat", name: "Chat" },
        { kind: "markdown", name: "Note" },
        { kind: "terminal", name: "Shell" },
      ]),
    );

    const notesOnly = unwrapToolResult(
      await tools.hanokiBrowseItems.execute!(
        { parentFolderId: null, kind: "markdown", limit: 20 },
        toolExecuteOptions,
      ),
    );
    expect(notesOnly.items).toEqual([expect.objectContaining({ kind: "markdown", id: note.id })]);

    const terminalsOnly = unwrapToolResult(
      await tools.hanokiBrowseItems.execute!(
        { parentFolderId: null, kind: "terminal", limit: 20 },
        toolExecuteOptions,
      ),
    );
    expect(terminalsOnly.items).toEqual([
      expect.objectContaining({ kind: "terminal", id: terminal.id }),
    ]);

    const renamedNote = unwrapToolResult(
      await tools.hanokiRenameItem.execute!(
        { kind: "markdown", id: note.id, newName: "Renamed note" },
        toolExecuteOptions,
      ),
    );
    expect(renamedNote.after).toEqual(
      expect.objectContaining({ kind: "markdown", id: note.id, name: "Renamed note" }),
    );

    const renamedTerminal = unwrapToolResult(
      await tools.hanokiRenameItem.execute!(
        { kind: "terminal", id: terminal.id, newName: "Renamed shell" },
        toolExecuteOptions,
      ),
    );
    expect(renamedTerminal.after).toEqual(
      expect.objectContaining({ kind: "terminal", id: terminal.id, name: "Renamed shell" }),
    );

    const moved = unwrapToolResult(
      await tools.hanokiMoveItems.execute!(
        {
          items: [
            { kind: "chat", id: chat.id },
            { kind: "markdown", id: note.id },
            { kind: "terminal", id: terminal.id },
          ],
          destinationFolderId: destination.id,
        },
        toolExecuteOptions,
      ),
    );
    expect(moved.moved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "chat", id: chat.id, parentFolderId: destination.id }),
        expect.objectContaining({ kind: "markdown", id: note.id, parentFolderId: destination.id }),
        expect.objectContaining({
          kind: "terminal",
          id: terminal.id,
          parentFolderId: destination.id,
        }),
      ]),
    );

    const archived = unwrapToolResult(
      await tools.hanokiBrowseItems.execute!(
        { parentFolderId: destination.id, kind: "all", limit: 20 },
        toolExecuteOptions,
      ),
    );
    expect(archived.items.map((item) => item.kind).sort()).toEqual([
      "chat",
      "markdown",
      "terminal",
    ]);
    expect(getItemById(note.id)?.folderId).toBe(destination.id);
    expect(getItemById(terminal.id)?.folderId).toBe(destination.id);
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
