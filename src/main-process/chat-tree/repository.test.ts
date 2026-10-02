import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { HANOKI_READ_CHAR_CEILING } from "@shared/chat/attached-items";
import { MAX_MARKDOWN_LENGTH } from "@shared/markdown/content";

import { closeAppDatabase, getAppDatabase } from "../db/database";
import { items, noteLinks } from "../db/schema";
import { beginChatGeneration, endChatGeneration } from "../server/chat-generation-gate";
import {
  listAllMessagesByChatId,
  listMessagesByChatId,
  upsertMessage,
} from "../messages/repository";
import {
  createHanokiTools,
  hanokiSendKickNeedsApproval,
  HANOKI_MUTATING_TOOL_NAMES,
  HANOKI_TOOL_NAMES,
  resolveAttachedItemPointers,
} from "../server/assistant/hanoki-tools";
import { createChatTreeService } from "../services/chat-tree-service";
import { createWorkspace } from "../workspaces/repository";
import {
  createChat,
  createFolder,
  createMarkdown,
  createTerminal,
  updateMarkdownContent,
  getChatById,
  getChatCurrentBranchId,
  getChatTreeChildren,
  getFolderById,
  deleteItem,
  getItemById,
  moveChatTreeItems,
  moveItem,
  searchWorkspaceChats,
  updateChatSettings,
  updateItemTitle,
} from "./repository";
import { importMarkdownNotesFromDirectory } from "../notes-folder-io/import-notes";
import {
  listMarkdownTitleOptions,
  listNoteBacklinks,
  rebuildWorkspaceNoteLinks,
} from "./note-links";

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
      import_relative_path text,
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
    create table note_links (
      workspace_id text not null references workspaces(id) on delete cascade,
      from_item_id text not null references items(id) on delete cascade,
      to_item_id text references items(id) on delete set null,
      target_text text not null,
      alias text not null default '',
      primary key (from_item_id, target_text, alias)
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
  db.run(
    sql.raw(`
    create table models (
      id text primary key,
      provider_id text not null,
      provider_model_id text not null,
      canonical_model_id text not null,
      display_name text,
      is_enabled integer not null default 1,
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      lifecycle_status text not null default 'active',
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

function insertModel(id: string, isEnabled: boolean, lifecycleStatus: string) {
  getAppDatabase().run(
    sql`insert into models (
      id, provider_id, provider_model_id, canonical_model_id, display_name,
      is_enabled, lifecycle_status, created_at, updated_at
    ) values (
      ${id}, 'provider', ${id}, ${id}, ${id},
      ${isEnabled ? 1 : 0}, ${lifecycleStatus}, ${Date.now()}, ${Date.now()}
    )`,
  );
}

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

  it("appends a draft user message to an explicit chat and does not start a reply", async () => {
    createWorkspace({ id: "send-draft-workspace", name: "Send draft" });
    const chat = createChat({
      workspaceId: "send-draft-workspace",
      title: "Target",
      folderId: null,
    });
    upsertMessage({
      id: "send-draft-existing",
      chatId: chat.id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "Already here" }],
      metadata: { parentId: null },
    });
    const note = createMarkdown({
      workspaceId: "send-draft-workspace",
      title: "Not a chat",
      folderId: null,
    });
    const onTreeChanged = vi.fn();
    const onMessagesChanged = vi.fn();
    const onGenerationRequested = vi.fn();
    const tools = createHanokiTools({
      workspaceId: "send-draft-workspace",
      chatId: "host-chat",
      onTreeChanged,
      onMessagesChanged,
      onGenerationRequested,
    });

    await expect(async () => {
      await tools.hanokiSendMessage.execute!({ chatId: "", text: "Nope" }, toolExecuteOptions);
    }).rejects.toThrow("Chat ID is required.");
    await expect(async () => {
      await tools.hanokiSendMessage.execute!({ chatId: note.id, text: "Nope" }, toolExecuteOptions);
    }).rejects.toThrow(`Chat "${note.id}" does not exist in this workspace.`);

    const result = unwrapToolResult(
      await tools.hanokiSendMessage.execute!(
        { chatId: chat.id, text: "  Draft hello  " },
        toolExecuteOptions,
      ),
    );

    expect(result).toEqual({
      chatId: chat.id,
      title: "Target",
      messageId: expect.any(String),
      role: "user",
      content: "Draft hello",
      startedGeneration: false,
      modelId: null,
    });
    expect(onGenerationRequested).not.toHaveBeenCalled();
    expect(HANOKI_MUTATING_TOOL_NAMES).not.toContain("hanokiSendMessage");
    expect(onTreeChanged).not.toHaveBeenCalled();
    expect(onMessagesChanged).toHaveBeenCalledTimes(1);
    expect(onMessagesChanged).toHaveBeenCalledWith(chat.id);
    const branch = listMessagesByChatId(chat.id, getChatCurrentBranchId(chat.id));
    expect(branch.map((message) => message.role)).toEqual(["user", "user"]);
    expect(branch.at(-1)).toEqual(
      expect.objectContaining({
        id: result.messageId,
        role: "user",
        parentId: "send-draft-existing",
      }),
    );
    expect(listAllMessagesByChatId(chat.id).some((message) => message.role === "assistant")).toBe(
      false,
    );
  });

  it("starts one cross-chat reply with an enabled model and rejects self, busy, and missing models", async () => {
    createWorkspace({ id: "send-kick-workspace", name: "Send kick" });
    insertModel("kick-active", true, "active");
    insertModel("kick-disabled", false, "active");
    insertModel("kick-removed", true, "removed");
    const host = createChat({
      workspaceId: "send-kick-workspace",
      title: "Host",
      folderId: null,
    });
    const target = createChat({
      workspaceId: "send-kick-workspace",
      title: "Other",
      folderId: null,
    });
    updateChatSettings(target.id, { modelId: "kick-active" });
    const onGenerationRequested = vi.fn();
    const tools = createHanokiTools({
      workspaceId: "send-kick-workspace",
      chatId: host.id,
      onGenerationRequested,
    });

    await expect(async () => {
      await tools.hanokiSendMessage.execute!(
        { chatId: host.id, text: "Self", kick: true },
        toolExecuteOptions,
      );
    }).rejects.toThrow("Cannot start a reply in the chat that is running this turn.");

    const noModel = createChat({
      workspaceId: "send-kick-workspace",
      title: "No model",
      folderId: null,
    });
    await expect(async () => {
      await tools.hanokiSendMessage.execute!(
        { chatId: noModel.id, text: "Go", kick: true, modelId: "kick-disabled" },
        toolExecuteOptions,
      );
    }).rejects.toThrow("No enabled model is available to start a reply in this chat.");
    expect(listAllMessagesByChatId(noModel.id)).toEqual([]);

    beginChatGeneration(target.id);
    await expect(async () => {
      await tools.hanokiSendMessage.execute!(
        { chatId: target.id, text: "Busy", kick: true },
        toolExecuteOptions,
      );
    }).rejects.toThrow(`Chat "${target.id}" is already generating a reply.`);
    endChatGeneration(target.id);
    expect(listAllMessagesByChatId(target.id)).toEqual([]);

    const result = unwrapToolResult(
      await tools.hanokiSendMessage.execute!(
        { chatId: target.id, text: "Please reply", kick: true, modelId: "kick-removed" },
        toolExecuteOptions,
      ),
    );
    expect(result).toEqual(
      expect.objectContaining({
        chatId: target.id,
        startedGeneration: true,
        modelId: "kick-active",
        role: "user",
      }),
    );
    expect(hanokiSendKickNeedsApproval(host.id, { chatId: host.id, kick: true })).toBe(false);
    expect(hanokiSendKickNeedsApproval(host.id, { chatId: target.id, kick: false })).toBe(false);
    beginChatGeneration(target.id);
    expect(hanokiSendKickNeedsApproval(host.id, { chatId: target.id, kick: true })).toBe(false);
    endChatGeneration(target.id);
    expect(hanokiSendKickNeedsApproval(host.id, { chatId: target.id, kick: true })).toBe(true);
    expect(onGenerationRequested).toHaveBeenCalledTimes(1);
    expect(onGenerationRequested).toHaveBeenCalledWith(target.id, "kick-active");
    expect(listAllMessagesByChatId(target.id).map((message) => message.role)).toEqual(["user"]);

    const listed = unwrapToolResult(await tools.hanokiListModels.execute!({}, toolExecuteOptions));
    expect(listed.models.map((model) => model.id)).toEqual(["kick-active"]);
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

describe("Hanoki context reads", () => {
  it("flushes a note before reading and truncates past the ceiling", async () => {
    createWorkspace({ id: "read-note-workspace", name: "Notes" });
    const host = createChat({
      workspaceId: "read-note-workspace",
      title: "Host",
      folderId: null,
    });
    const note = createMarkdown({
      workspaceId: "read-note-workspace",
      title: "Plan",
      folderId: null,
    });
    updateMarkdownContent(note.id, "stale");
    const chat = createChat({
      workspaceId: "read-note-workspace",
      title: "Other",
      folderId: null,
    });
    let flushedOnce = false;
    const tools = createHanokiTools({
      workspaceId: "read-note-workspace",
      chatId: host.id,
      flushMarkdownContent: (id) => {
        if (!flushedOnce) {
          flushedOnce = true;
          updateMarkdownContent(id, "fresh from editor");
        }
        const saved = getItemById(id);
        if (!saved || saved.type !== "markdown") throw new Error("missing note");
        return saved;
      },
    });

    const read = unwrapToolResult(
      await tools.readNote.execute!({ noteId: note.id }, toolExecuteOptions),
    );
    expect(read).toEqual({
      kind: "note",
      itemId: note.id,
      title: "Plan",
      content: "fresh from editor",
      truncated: false,
    });
    expect(getItemById(note.id)?.data).toEqual({ markdown: "fresh from editor" });

    const long = "x".repeat(HANOKI_READ_CHAR_CEILING + 20);
    updateMarkdownContent(note.id, long);
    const truncated = unwrapToolResult(
      await tools.readNote.execute!({ noteId: note.id }, toolExecuteOptions),
    );
    expect(truncated.truncated).toBe(true);
    expect(truncated.content.startsWith("x".repeat(HANOKI_READ_CHAR_CEILING))).toBe(true);
    expect(truncated.content).toContain(
      `[truncated: this read stopped at ${HANOKI_READ_CHAR_CEILING} characters]`,
    );

    await expect(async () => {
      await tools.readNote.execute!({ noteId: chat.id }, toolExecuteOptions);
    }).rejects.toThrow(/not a note/);
    await expect(async () => {
      await tools.readNote.execute!({ noteId: "missing-note" }, toolExecuteOptions);
    }).rejects.toThrow(/does not exist/);
  });

  it("pages chats with a character ceiling and refuses the hosting chat", async () => {
    createWorkspace({ id: "read-chat-workspace", name: "Chats" });
    const host = createChat({
      workspaceId: "read-chat-workspace",
      title: "Host",
      folderId: null,
    });
    const other = createChat({
      workspaceId: "read-chat-workspace",
      title: "Source",
      folderId: null,
    });
    upsertMessage({
      id: "read-chat-old",
      chatId: other.id,
      parentId: null,
      role: "user",
      parts: [{ type: "text", text: "older page" }],
      metadata: { parentId: null },
    });
    upsertMessage({
      id: "read-chat-new",
      chatId: other.id,
      parentId: "read-chat-old",
      role: "assistant",
      parts: [{ type: "text", text: "y".repeat(HANOKI_READ_CHAR_CEILING + 5) }],
      metadata: { parentId: "read-chat-old" },
    });
    const tools = createHanokiTools({ workspaceId: "read-chat-workspace", chatId: host.id });

    await expect(async () => {
      await tools.readChat.execute!({ chatId: host.id, limit: 10 }, toolExecuteOptions);
    }).rejects.toThrow(/hosting this turn/);

    const latest = unwrapToolResult(
      await tools.readChat.execute!({ chatId: other.id, limit: 100 }, toolExecuteOptions),
    );
    expect(latest.truncated).toBe(true);
    expect(latest.messages).toHaveLength(1);
    expect(latest.messages[0]?.id).toBe("read-chat-new");
    expect(latest.messages[0]?.content).toContain("[truncated:");
    expect(latest.nextBeforeMessageId).toBe("read-chat-new");

    const older = unwrapToolResult(
      await tools.readChat.execute!(
        { chatId: other.id, limit: 100, beforeMessageId: latest.nextBeforeMessageId },
        toolExecuteOptions,
      ),
    );
    expect(older.truncated).toBe(false);
    expect(older.messages.map((message) => message.content)).toEqual(["older page"]);
    expect(older.nextBeforeMessageId).toBeNull();

    const hostRead = unwrapToolResult(
      await tools.hanokiGetChatContent.execute!({ chatId: host.id, limit: 10 }, toolExecuteOptions),
    );
    expect(hostRead.messages).toEqual([]);

    expect(
      resolveAttachedItemPointers("read-chat-workspace", [
        { kind: "note", itemId: "missing" },
        { kind: "chat", itemId: other.id },
      ]),
    ).toEqual([
      { kind: "note", itemId: "missing", title: null },
      { kind: "chat", itemId: other.id, title: "Source" },
    ]);
  });
});

function markdownOf(itemId: string): string {
  const item = getItemById(itemId);
  if (item?.type !== "markdown") throw new Error(`Item "${itemId}" is not markdown.`);
  return item.data.markdown;
}

describe("note links", () => {
  it("indexes title links, keeps aliases, and ignores code", () => {
    const workspace = createWorkspace({ id: "links-workspace", name: "Links" });
    const folder = createFolder({
      workspaceId: workspace.id,
      name: "Garden",
      parentId: null,
    });
    const target = createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: folder.id,
    });
    const source = createMarkdown({
      workspaceId: workspace.id,
      title: "Source",
      folderId: null,
    });
    updateMarkdownContent(
      source.id,
      "See [[Alpha|the plant]] today.\n\n```\n[[Alpha]]\n```\n\n`[[Alpha]]`",
    );

    expect(
      listMarkdownTitleOptions(workspace.id).find((note) => note.id === target.id),
    ).toMatchObject({
      title: "Alpha",
      folderPath: "Garden",
    });
    expect(listNoteBacklinks(target.id)).toEqual([
      {
        itemId: source.id,
        title: "Source",
        snippet: "See the plant today.",
      },
    ]);
    expect(getItemById(source.id)?.type === "markdown" && getItemById(source.id)).toBeTruthy();
    const saved = getItemById(source.id);
    expect(saved?.type).toBe("markdown");
    if (saved?.type === "markdown") {
      expect(saved.data.markdown).toContain("[[Alpha|the plant]]");
      expect(saved.data.markdown).not.toContain(target.id);
    }
  });

  it("resolves duplicate titles to the oldest item id and leaves misses unresolved", () => {
    const workspace = createWorkspace({ id: "links-dupes", name: "Dupes" });
    const older = createMarkdown({ workspaceId: workspace.id, title: "Twin", folderId: null });
    const newer = createMarkdown({ workspaceId: workspace.id, title: "Twin", folderId: null });
    getAppDatabase().update(items).set({ createdAt: 0 }).where(eq(items.id, newer.id)).run();
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    updateMarkdownContent(source.id, "[[Twin]]\n[[Missing]]");

    expect(older.id < newer.id).toBe(true);
    expect(listNoteBacklinks(older.id).map((link) => link.itemId)).toEqual([source.id]);
    expect(listNoteBacklinks(newer.id)).toEqual([]);
    expect(
      getAppDatabase().select().from(noteLinks).where(eq(noteLinks.fromItemId, source.id)).all(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetText: "Twin", toItemId: older.id }),
        expect.objectContaining({ targetText: "Missing", toItemId: null }),
      ]),
    );

    deleteItem(older.id);
    expect(listNoteBacklinks(newer.id).map((link) => link.itemId)).toEqual([source.id]);
  });

  it("rewrites linking markdown when the target note is renamed", () => {
    const workspace = createWorkspace({ id: "links-rename", name: "Rename" });
    const target = createMarkdown({ workspaceId: workspace.id, title: "Old", folderId: null });
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    updateMarkdownContent(source.id, "[[Old|pet]]");

    updateItemTitle(target.id, "New");
    const saved = getItemById(source.id);
    expect(saved?.type).toBe("markdown");
    if (saved?.type === "markdown") expect(saved.data.markdown).toBe("[[New|pet]]");
    expect(listNoteBacklinks(target.id)).toEqual([
      { itemId: source.id, title: "Source", snippet: "pet" },
    ]);

    rebuildWorkspaceNoteLinks(workspace.id);
    expect(listNoteBacklinks(target.id).map((link) => link.itemId)).toEqual([source.id]);
  });

  it("rewrites only notes whose link resolved to the renamed item", () => {
    const workspace = createWorkspace({ id: "links-rename-scope", name: "Rename scope" });
    const older = createMarkdown({ workspaceId: workspace.id, title: "Twin", folderId: null });
    const newer = createMarkdown({ workspaceId: workspace.id, title: "Twin", folderId: null });
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    const bystander = createMarkdown({
      workspaceId: workspace.id,
      title: "Bystander",
      folderId: null,
    });
    const solo = createMarkdown({ workspaceId: workspace.id, title: "Solo", folderId: null });
    updateMarkdownContent(source.id, "[[Twin]]");
    updateMarkdownContent(bystander.id, "```\n[[Twin]]\n```\n\n[[Solo]]");

    updateItemTitle(newer.id, "Renamed");
    expect(markdownOf(source.id)).toBe("[[Twin]]");
    expect(markdownOf(bystander.id)).toBe("```\n[[Twin]]\n```\n\n[[Solo]]");
    expect(listNoteBacklinks(older.id).map((link) => link.itemId)).toEqual([source.id]);

    updateItemTitle(older.id, "Winner");
    expect(markdownOf(source.id)).toBe("[[Winner]]");
    expect(markdownOf(source.id)).not.toContain(older.id);
    expect(markdownOf(bystander.id)).toBe("```\n[[Twin]]\n```\n\n[[Solo]]");
    expect(listNoteBacklinks(older.id).map((link) => link.itemId)).toEqual([source.id]);
    expect(listNoteBacklinks(solo.id).map((link) => link.itemId)).toEqual([bystander.id]);
  });

  it("resolves a link when the target note is created later", () => {
    const workspace = createWorkspace({ id: "links-later", name: "Later" });
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    updateMarkdownContent(source.id, "[[Future]] and [[Source]]");
    const future = createMarkdown({ workspaceId: workspace.id, title: "Future", folderId: null });

    expect(listNoteBacklinks(future.id).map((link) => link.itemId)).toEqual([source.id]);
    expect(listNoteBacklinks(source.id).map((link) => link.itemId)).toEqual([source.id]);
    expect(listNoteBacklinks(source.id)[0]?.snippet).toBe("Future and Source");
  });

  it("resolves path and heading links inside one import root", () => {
    const workspace = createWorkspace({ id: "links-path", name: "Path" });
    const imported = createFolder({
      workspaceId: workspace.id,
      name: "Imported",
      parentId: null,
    });
    const wrap = createFolder({
      workspaceId: workspace.id,
      name: "Vault",
      parentId: imported.id,
    });
    const projects = createFolder({
      workspaceId: workspace.id,
      name: "Projects",
      parentId: wrap.id,
    });
    const resident = createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: null,
    });
    const alpha = createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: projects.id,
      importRelativePath: "Projects/Alpha",
    });
    const beta = createMarkdown({
      workspaceId: workspace.id,
      title: "Beta",
      folderId: projects.id,
    });
    const archive = createFolder({
      workspaceId: workspace.id,
      name: "Archive",
      parentId: wrap.id,
    });
    const drafts = createFolder({
      workspaceId: workspace.id,
      name: "Drafts",
      parentId: wrap.id,
    });
    const olderScene = createMarkdown({
      workspaceId: workspace.id,
      title: "Scene",
      folderId: archive.id,
      importRelativePath: "Archive/Scene",
    });
    const newerScene = createMarkdown({
      workspaceId: workspace.id,
      title: "Scene",
      folderId: drafts.id,
      importRelativePath: "Drafts/Scene",
    });
    const source = createMarkdown({
      workspaceId: workspace.id,
      title: "Index",
      folderId: wrap.id,
    });
    const body = [
      "[[Projects/Alpha]]",
      "[[Projects/Alpha.md]]",
      "[[Projects/Alpha#Heading]]",
      "[[projects/alpha]]",
      "[[Projects/Beta]]",
      "[[Alpha#Intro]]",
      "[[Scene]]",
      "[[Archive/Scene|old]]",
      "[[Drafts/Scene#Later]]",
    ].join("\n");
    updateMarkdownContent(source.id, body);

    const outsider = createMarkdown({
      workspaceId: workspace.id,
      title: "Outsider",
      folderId: null,
    });
    updateMarkdownContent(outsider.id, "[[Projects/Alpha]]");

    expect(markdownOf(source.id)).toBe(body);
    expect(linkedTo(workspace.id, source.id, "Projects/Alpha")).toBe(alpha.id);
    expect(linkedTo(workspace.id, source.id, "Projects/Alpha.md")).toBe(alpha.id);
    expect(linkedTo(workspace.id, source.id, "Projects/Alpha#Heading")).toBe(alpha.id);
    expect(linkedTo(workspace.id, source.id, "projects/alpha")).toBe(alpha.id);
    expect(linkedTo(workspace.id, source.id, "Projects/Beta")).toBe(beta.id);
    expect(linkedTo(workspace.id, source.id, "Alpha#Intro")).toBe(alpha.id);
    expect(listNoteBacklinks(resident.id)).toEqual([]);
    expect(linkedTo(workspace.id, source.id, "Scene")).toBe(olderScene.id);
    expect(linkedTo(workspace.id, source.id, "Archive/Scene")).toBe(olderScene.id);
    expect(linkedTo(workspace.id, source.id, "Drafts/Scene#Later")).toBe(newerScene.id);
    expect(linkedTo(workspace.id, outsider.id, "Projects/Alpha")).toBeNull();
    expect(listNoteBacklinks(newerScene.id).map((link) => link.itemId)).toEqual([source.id]);
    expect(listNoteBacklinks(olderScene.id).map((link) => link.itemId)).toContain(source.id);
  });

  it("resolves a golden vault after import rebuild, scoped to each wrap", async () => {
    const workspace = createWorkspace({ id: "links-vault", name: "Vault import" });
    const resident = createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: null,
    });
    const root = mkdtempSync(join(tmpdir(), "hanoki-golden-vault-"));
    try {
      mkdirSync(join(root, "Projects"), { recursive: true });
      mkdirSync(join(root, "Archive"), { recursive: true });
      mkdirSync(join(root, "Drafts"), { recursive: true });
      writeFileSync(
        join(root, "Projects", "Alpha.md"),
        "---\ntitle: Alpha\n---\n[[Archive/Scene]]\n[[Drafts/Scene#Later]]\n",
      );
      writeFileSync(
        join(root, "Archive", "Scene.md"),
        "[[Projects/Alpha|the alpha]]\n[[Projects/Alpha#Heading]]\n",
      );
      writeFileSync(join(root, "Drafts", "Scene.md"), "[[Scene]]\n[[Projects/Alpha.md]]\n");
      writeFileSync(join(root, "Loose.md"), "[[Alpha#Intro]]\n[[Loose|me]]\n");

      const chatTree = createChatTreeService();
      const first = await importMarkdownNotesFromDirectory(chatTree, workspace.id, root);
      expect(first.wrapFolderPath.startsWith("Imported/")).toBe(true);
      expect(first.noteCount).toBe(4);

      const notes = markdownRows(workspace.id);
      const alpha = notes.find((note) => note.importRelativePath === "Projects/Alpha");
      const archive = notes.find((note) => note.importRelativePath === "Archive/Scene");
      const drafts = notes.find((note) => note.importRelativePath === "Drafts/Scene");
      const loose = notes.find((note) => note.importRelativePath === "Loose");
      expect(alpha?.markdown).toBe(
        "---\ntitle: Alpha\n---\n[[Archive/Scene]]\n[[Drafts/Scene#Later]]\n",
      );
      expect(alpha && archive && drafts && loose).toBeTruthy();
      if (!alpha || !archive || !drafts || !loose) return;

      expect(linkedTo(workspace.id, alpha.id, "Archive/Scene")).toBe(archive.id);
      expect(linkedTo(workspace.id, alpha.id, "Drafts/Scene#Later")).toBe(drafts.id);
      expect(linkedTo(workspace.id, archive.id, "Projects/Alpha")).toBe(alpha.id);
      expect(linkedTo(workspace.id, archive.id, "Projects/Alpha#Heading")).toBe(alpha.id);
      expect(linkedTo(workspace.id, drafts.id, "Scene")).toBe(archive.id);
      expect(linkedTo(workspace.id, drafts.id, "Projects/Alpha.md")).toBe(alpha.id);
      expect(linkedTo(workspace.id, loose.id, "Alpha#Intro")).toBe(alpha.id);
      expect(linkedTo(workspace.id, loose.id, "Loose")).toBe(loose.id);
      expect(markdownOf(archive.id)).toBe(
        "[[Projects/Alpha|the alpha]]\n[[Projects/Alpha#Heading]]\n",
      );

      const second = await importMarkdownNotesFromDirectory(chatTree, workspace.id, root);
      expect(second.wrapFolderPath).not.toBe(first.wrapFolderPath);
      const again = markdownRows(workspace.id).filter(
        (note) => note.importRelativePath === "Projects/Alpha" && note.id !== alpha.id,
      );
      expect(again).toHaveLength(1);
      const secondAlpha = again[0];
      const secondArchive = markdownRows(workspace.id).find(
        (note) => note.importRelativePath === "Archive/Scene" && note.id !== archive.id,
      );
      expect(secondAlpha && secondArchive).toBeTruthy();
      if (!secondAlpha || !secondArchive) return;
      expect(linkedTo(workspace.id, secondArchive.id, "Projects/Alpha")).toBe(secondAlpha.id);
      expect(linkedTo(workspace.id, archive.id, "Projects/Alpha")).toBe(alpha.id);
      const secondDrafts = markdownRows(workspace.id).find(
        (note) => note.importRelativePath === "Drafts/Scene" && note.id !== drafts.id,
      );
      expect(secondDrafts).toBeTruthy();
      if (secondDrafts) {
        expect(linkedTo(workspace.id, secondDrafts.id, "Scene")).toBe(secondArchive.id);
      }
      expect(linkedTo(workspace.id, drafts.id, "Scene")).toBe(archive.id);
      expect(listNoteBacklinks(resident.id)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves titles that contain # before stripping a fragment", () => {
    const workspace = createWorkspace({ id: "links-hash-title", name: "Hash title" });
    const csharp = createMarkdown({ workspaceId: workspace.id, title: "C# notes", folderId: null });
    const issue = createMarkdown({
      workspaceId: workspace.id,
      title: "Issue #12",
      folderId: null,
    });
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    const body = "[[C# notes]]\n[[Issue #12]]\n[[C# notes|lang]]";
    updateMarkdownContent(source.id, body);

    expect(markdownOf(source.id)).toBe(body);
    expect(linkedTo(workspace.id, source.id, "C# notes")).toBe(csharp.id);
    expect(linkedTo(workspace.id, source.id, "Issue #12")).toBe(issue.id);
    expect(listNoteBacklinks(csharp.id).map((link) => link.itemId)).toEqual([source.id]);
  });

  it("keeps the fragment and alias when renaming a resolved title link", () => {
    const workspace = createWorkspace({ id: "links-hash-rename", name: "Hash rename" });
    const alpha = createMarkdown({ workspaceId: workspace.id, title: "Alpha", folderId: null });
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    updateMarkdownContent(source.id, "[[Alpha#Intro|alias]]\n[[Projects/Alpha#H]]");

    updateItemTitle(alpha.id, "New");

    expect(markdownOf(source.id)).toBe("[[New#Intro|alias]]\n[[Projects/Alpha#H]]");
    expect(linkedTo(workspace.id, source.id, "New#Intro")).toBe(alpha.id);
    expect(linkedTo(workspace.id, source.id, "Projects/Alpha#H")).toBeNull();
  });

  it("keeps path links on the imported note after rename and move", () => {
    const workspace = createWorkspace({ id: "links-path-stable", name: "Path stable" });
    const imported = createFolder({
      workspaceId: workspace.id,
      name: "Imported",
      parentId: null,
    });
    const wrap = createFolder({
      workspaceId: workspace.id,
      name: "Vault",
      parentId: imported.id,
    });
    const projects = createFolder({
      workspaceId: workspace.id,
      name: "Projects",
      parentId: wrap.id,
    });
    const elsewhere = createFolder({
      workspaceId: workspace.id,
      name: "Elsewhere",
      parentId: wrap.id,
    });
    const alpha = createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: projects.id,
      importRelativePath: "Projects/Alpha",
    });
    const source = createMarkdown({
      workspaceId: workspace.id,
      title: "Index",
      folderId: wrap.id,
    });
    const body = "[[Projects/Alpha]]\n[[Projects/Alpha#H|alias]]";
    updateMarkdownContent(source.id, body);

    updateItemTitle(alpha.id, "Renamed");
    moveItem(alpha.id, elsewhere.id);
    createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: projects.id,
    });
    rebuildWorkspaceNoteLinks(workspace.id);

    expect(markdownOf(source.id)).toBe(body);
    const moved = getItemById(alpha.id);
    expect(moved?.type).toBe("markdown");
    if (moved?.type !== "markdown") return;
    expect(moved.title).toBe("Renamed");
    expect(moved.folderId).toBe(elsewhere.id);
    expect(
      getAppDatabase()
        .select({ importRelativePath: items.importRelativePath })
        .from(items)
        .where(eq(items.id, alpha.id))
        .get()?.importRelativePath,
    ).toBe("Projects/Alpha");
    expect(linkedTo(workspace.id, source.id, "Projects/Alpha")).toBe(alpha.id);
    expect(linkedTo(workspace.id, source.id, "Projects/Alpha#H")).toBe(alpha.id);
  });

  it("skips per-note link indexing when asked and resolves on rebuild", () => {
    const workspace = createWorkspace({ id: "links-skip-index", name: "Skip index" });
    const alpha = createMarkdown({
      workspaceId: workspace.id,
      title: "Alpha",
      folderId: null,
      skipLinkIndex: true,
    });
    const source = createMarkdown({
      workspaceId: workspace.id,
      title: "Source",
      folderId: null,
      skipLinkIndex: true,
    });
    updateMarkdownContent(source.id, "[[Alpha]]", { skipLinkIndex: true });

    expect(countNoteLinks(workspace.id)).toBe(0);
    rebuildWorkspaceNoteLinks(workspace.id);
    expect(linkedTo(workspace.id, source.id, "Alpha")).toBe(alpha.id);
  });

  it("reindexes one note whose links exceed the SQLite variable limit", () => {
    const workspace = createWorkspace({ id: "links-var-one", name: "Var one" });
    const known = createMarkdown({ workspaceId: workspace.id, title: "Known", folderId: null });
    const source = createMarkdown({ workspaceId: workspace.id, title: "Source", folderId: null });
    const linkCount = linksPastVariableLimit();
    const lines = ["[[Known]]"];
    for (let index = 1; index < linkCount; index += 1) lines.push(`[[m${index}]]`);

    updateMarkdownContent(source.id, lines.join("\n"));

    expect(countNoteLinks(workspace.id)).toBe(linkCount);
    expect(linkedTo(workspace.id, source.id, "Known")).toBe(known.id);
  });

  it("rebuilds a workspace whose links exceed the SQLite variable limit", () => {
    const workspace = createWorkspace({ id: "links-var-many", name: "Var many" });
    const known = createMarkdown({ workspaceId: workspace.id, title: "Known", folderId: null });
    const perNote = 10;
    const edgeCount = linksPastVariableLimit();
    const noteCount = Math.ceil(edgeCount / perNote);
    const db = getAppDatabase();
    for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
      const lines: string[] = [];
      for (let linkIndex = 0; linkIndex < perNote; linkIndex += 1) {
        lines.push(
          noteIndex === 0 && linkIndex === 0 ? "[[Known]]" : `[[x${noteIndex}-${linkIndex}]]`,
        );
      }
      db.insert(items)
        .values({
          id: `var-many-${noteIndex}`,
          workspaceId: workspace.id,
          folderId: null,
          type: "markdown",
          title: `Note ${noteIndex}`,
          data: { markdown: lines.join("\n") },
        })
        .run();
    }

    rebuildWorkspaceNoteLinks(workspace.id);

    expect(countNoteLinks(workspace.id)).toBe(noteCount * perNote);
    expect(linkedTo(workspace.id, "var-many-0", "Known")).toBe(known.id);
  });
});

function linksPastVariableLimit(): number {
  return Math.max(5000, Math.floor(sqliteVariableLimit() / 5) + 1);
}

function sqliteVariableLimit(): number {
  const sqlite = getAppDatabase().$client;
  const query = sqlite.prepare("SELECT sqlite_compileoption_get(?) AS opt");
  for (let index = 0; ; index += 1) {
    const row = query.get(index) as { opt: string | null } | undefined;
    if (!row?.opt) break;
    const match = /^MAX_VARIABLE_NUMBER=(\d+)$/.exec(row.opt);
    const parsed = match?.[1] ? Number(match[1]) : Number.NaN;
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return 999;
}

function countNoteLinks(workspaceId: string): number {
  const rows = getAppDatabase()
    .select({ fromItemId: noteLinks.fromItemId })
    .from(noteLinks)
    .where(eq(noteLinks.workspaceId, workspaceId))
    .all();
  return rows.length;
}

function linkedTo(workspaceId: string, fromItemId: string, targetText: string): string | null {
  const row = getAppDatabase()
    .select({ toItemId: noteLinks.toItemId })
    .from(noteLinks)
    .where(
      and(
        eq(noteLinks.workspaceId, workspaceId),
        eq(noteLinks.fromItemId, fromItemId),
        eq(noteLinks.targetText, targetText),
      ),
    )
    .get();
  return row?.toItemId ?? null;
}

function markdownRows(workspaceId: string) {
  return getAppDatabase()
    .select({
      id: items.id,
      title: items.title,
      importRelativePath: items.importRelativePath,
      data: items.data,
    })
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), eq(items.type, "markdown")))
    .all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      importRelativePath: row.importRelativePath,
      markdown: "markdown" in row.data ? row.data.markdown : "",
    }));
}
