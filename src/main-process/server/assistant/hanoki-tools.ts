import { jsonSchema, tool, type JSONSchema7 } from "ai";
import {
  HANOKI_READ_CHAR_CEILING,
  type AttachedItemPointer,
  type AttachedItemRef,
} from "@shared/chat/attached-items";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderName } from "@shared/folder/folder-name";
import { MAX_MARKDOWN_LENGTH } from "@shared/markdown/content";
import {
  createTiptapDocumentFromText,
  createTiptapMessageParts,
  getMessageDisplayText,
} from "@shared/tiptap/document";
import {
  createChat,
  createFolder,
  createMarkdown,
  deleteChatTreeItems,
  getChatById,
  getChatCurrentBranchId,
  getChatTree,
  setChatCurrentBranch,
  getChatTreeChildren,
  getFolderById,
  getItemById,
  moveChatTreeItems,
  searchWorkspaceChats,
  updateChatTitle,
  updateFolderName,
  updateItemTitle,
  updateMarkdownContent,
  type ChatTreeFolderNode,
} from "../../chat-tree/repository";
import { createUuidV7 } from "../../db/uuidv7";
import { flushOpenMarkdownEditorsInRenderer } from "../../flush-open-markdown-editors";
import { getModelById, listEnabledModels } from "../../models/repository";
import {
  listAllMessagesByChatId,
  listMessagesByChatId,
  upsertMessage,
} from "../../messages/repository";
import { isChatGenerationBusy, reserveChatKick } from "../chat-generation-gate";

/** Only a cross-chat kick asks. Self-kick and a busy target skip the card and fail in execute. */
export function hanokiSendKickNeedsApproval(
  hostChatId: string,
  input: { kick?: boolean; chatId?: string },
): boolean {
  if (input.kick !== true) return false;
  const targetChatId = input.chatId?.trim() ?? "";
  if (!targetChatId || targetChatId === hostChatId) return false;
  return !isChatGenerationBusy(targetChatId);
}

type ItemKind = "chat" | "folder" | "markdown" | "terminal";
type ItemRef = { kind: ItemKind; id: string };
type BrowseKind = "all" | ItemKind;

const itemKindEnum = ["chat", "folder", "markdown", "terminal"] as const;

const itemRefSchema: JSONSchema7 = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [...itemKindEnum],
      description: "The kind of Hanoki item.",
    },
    id: {
      type: "string",
      minLength: 1,
      description: "The exact item ID returned by a Hanoki tool.",
    },
  },
  required: ["kind", "id"],
  additionalProperties: false,
};

function normalizeNullableString(value: string | null | undefined): string | null {
  return value === "" || value === undefined ? null : value;
}

function parseCursor(cursor: string | null | undefined): number {
  const normalizedCursor = normalizeNullableString(cursor);
  if (normalizedCursor === null) return 0;
  const offset = Number(normalizedCursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Cursor is invalid. Use the nextCursor returned by the previous result.");
  }
  return offset;
}

function getFolderPaths(workspaceId: string): Map<string, string> {
  const paths = new Map<string, string>();

  function visit(folders: readonly ChatTreeFolderNode[], parentPath: string) {
    for (const folder of folders) {
      const path = parentPath ? `${parentPath}/${folder.name}` : folder.name;
      paths.set(folder.id, path);
      visit(folder.folders, path);
    }
  }

  visit(getChatTree(workspaceId).rootFolders, "");
  return paths;
}

const MAX_FOLDER_PATH_DEPTH = 32; // ponytail: breadcrumb cap; walk further only if agents need the full chain

function getFolderPathSegments(
  workspaceId: string,
  folderId: string | null,
): { id: string; name: string }[] {
  if (folderId === null) return [];
  const segments: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let currentId: string | null = folderId;
  while (currentId !== null && segments.length < MAX_FOLDER_PATH_DEPTH) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const folder = getFolderById(currentId);
    if (!folder || folder.workspaceId !== workspaceId) break;
    segments.push({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }
  return segments.reverse();
}

function getFolderLocation(workspaceId: string, folderId: string | null) {
  const path = getFolderPathSegments(workspaceId, folderId);
  return {
    folderId,
    path,
    pathString: path.map((segment) => segment.name).join("/"),
  };
}

function itemKindLabel(kind: Exclude<ItemKind, "folder">): string {
  if (kind === "chat") return "Chat";
  if (kind === "markdown") return "Markdown note";
  return "Terminal";
}

function summarizeItem(workspaceId: string, item: ItemRef, folderPaths: Map<string, string>) {
  if (item.kind === "folder") {
    const folder = getFolderById(item.id);
    if (!folder || folder.workspaceId !== workspaceId) {
      throw new Error(`Folder "${item.id}" does not exist in this workspace.`);
    }
    return {
      kind: item.kind,
      id: folder.id,
      name: folder.name,
      parentFolderId: folder.parentId,
      path: folderPaths.get(folder.id) ?? folder.name,
      updatedAt: folder.updatedAt,
    };
  }

  const row = getItemById(item.id);
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error(`${itemKindLabel(item.kind)} "${item.id}" does not exist in this workspace.`);
  }
  if (row.type !== item.kind) {
    throw new Error(`Item "${item.id}" is not a ${item.kind}.`);
  }
  const folderPath = row.folderId ? folderPaths.get(row.folderId) : undefined;
  return {
    kind: item.kind,
    id: row.id,
    name: row.title,
    parentFolderId: row.folderId,
    path: folderPath ? `${folderPath}/${row.title}` : row.title,
    updatedAt: row.updatedAt,
  };
}

function toMoveRef(item: ItemRef) {
  return { kind: item.kind === "folder" ? ("folder" as const) : ("item" as const), id: item.id };
}

function toToolItem(workspaceId: string, item: { kind: "item" | "folder"; id: string }): ItemRef {
  if (item.kind === "folder") return { kind: "folder", id: item.id };
  const row = getItemById(item.id);
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error(`Item "${item.id}" does not exist in this workspace.`);
  }
  return { kind: row.type, id: row.id };
}

function getSnippet(text: string, query: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const index = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - 80);
  const end = Math.min(normalized.length, index + query.length + 120);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

function getStoredMessageText(message: { parts: unknown[] }): string {
  // SAFETY: persisted chat parts are Hanoki UI message parts.
  return getMessageDisplayText({ parts: message.parts as HanokiUiMessage["parts"] });
}

function isActiveEnabledModel(modelId: string | null | undefined): modelId is string {
  if (!modelId) return false;
  const model = getModelById(modelId);
  return Boolean(model && model.isEnabled && model.lifecycleStatus === "active");
}

function resolveKickModelId(
  explicitModelId: string | null,
  settingsModelId: string | null,
): string {
  if (isActiveEnabledModel(explicitModelId)) return explicitModelId;
  if (isActiveEnabledModel(settingsModelId)) return settingsModelId;
  throw new Error("No enabled model is available to start a reply in this chat.");
}

export function resolveAttachedItemPointers(
  workspaceId: string,
  items: readonly AttachedItemRef[],
): AttachedItemPointer[] {
  return items.map((item) => {
    const row = getItemById(item.itemId);
    const expectedType = item.kind === "note" ? "markdown" : "chat";
    if (!row || row.workspaceId !== workspaceId || row.type !== expectedType) {
      return { kind: item.kind, itemId: item.itemId, title: null };
    }
    return { kind: item.kind, itemId: item.itemId, title: row.title };
  });
}

const READ_TRUNCATION_MARKER = `\n\n[truncated: this read stopped at ${HANOKI_READ_CHAR_CEILING} characters]`;

function capReadText(text: string): { text: string; truncated: boolean } {
  if (text.length <= HANOKI_READ_CHAR_CEILING) return { text, truncated: false };
  return {
    text: `${text.slice(0, HANOKI_READ_CHAR_CEILING)}${READ_TRUNCATION_MARKER}`,
    truncated: true,
  };
}

interface ReadableChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: number;
}

function capChatMessages(page: readonly ReadableChatMessage[]): {
  messages: ReadableChatMessage[];
  truncated: boolean;
} {
  let used = 0;
  const kept: ReadableChatMessage[] = [];
  let truncated = false;
  for (let index = page.length - 1; index >= 0; index -= 1) {
    const message = page[index];
    if (!message) continue;
    const remaining = HANOKI_READ_CHAR_CEILING - used;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (message.content.length > remaining) {
      kept.push({
        ...message,
        content: `${message.content.slice(0, remaining)}${READ_TRUNCATION_MARKER}`,
      });
      truncated = true;
      break;
    }
    kept.push(message);
    used += message.content.length;
  }
  kept.reverse();
  return { messages: kept, truncated };
}

/** Port over TerminalService so tools stay testable without a PTY/Electron. */
export interface HanokiTerminalPort {
  create(input: { workspaceId: string; title: string; folderId: string | null }): { id: string };
  getOutput(
    id: string,
  ): Promise<{ status: string; exitCode: number | null; output: string; truncated: boolean }>;
  runCommand(
    id: string,
    command: string,
    timeoutMs?: number,
  ): Promise<{
    status: string;
    exitCode: number | null;
    output: string;
    truncated: boolean;
    timedOut: boolean;
    commandExitCode: number | null;
  }>;
  writeInput(
    id: string,
    data: string,
  ): Promise<{ status: string; exitCode: number | null; output: string; truncated: boolean }>;
  interrupt(
    id: string,
  ): Promise<{ status: string; exitCode: number | null; output: string; truncated: boolean }>;
  disposeItem(id: string): Promise<void>;
}

export interface HanokiToolCatalogEntry {
  name: string;
  group: "read" | "write" | "terminal" | "discovery";
  access: "core" | "deferred";
  summary: string;
}

/**
 * Single source of truth for tool discovery. Core tools are always active when
 * Hanoki is enabled; deferred tools are loaded via hanokiFindTools + prepareStep
 * (provider-agnostic tool search — native provider tool-search only exists on
 * Anthropic/OpenAI Responses, Hanoki supports many providers).
 */
export const HANOKI_TOOL_CATALOG: readonly HanokiToolCatalogEntry[] = [
  {
    name: "hanokiFindTools",
    group: "discovery",
    access: "core",
    summary: "Search for additional Hanoki tools by goal and load them for this turn.",
  },
  {
    name: "hanokiGetItem",
    group: "read",
    access: "core",
    summary: "Get detailed information about one item or folder by exact id.",
  },
  {
    name: "hanokiBrowseItems",
    group: "read",
    access: "core",
    summary: "Browse folders, chats, notes, and terminals in the workspace tree.",
  },
  {
    name: "hanokiSearchChats",
    group: "read",
    access: "core",
    summary: "Search chat titles and message content.",
  },
  {
    name: "hanokiGetChatContent",
    group: "read",
    access: "core",
    summary: "Read messages from a chat by id with pagination.",
  },
  {
    name: "hanokiReadNote",
    group: "read",
    access: "core",
    summary: "Read a markdown note body by id.",
  },
  {
    name: "hanokiReadChat",
    group: "read",
    access: "core",
    summary: "Read another chat's messages by id (refuses the hosting chat).",
  },
  {
    name: "hanokiGetCurrentFolder",
    group: "read",
    access: "core",
    summary: "Get the folder containing the chat hosting this turn.",
  },
  {
    name: "hanokiGetItemLocation",
    group: "read",
    access: "deferred",
    summary: "Get the folder and path of an item by id.",
  },
  { name: "hanokiCreateFolder", group: "write", access: "deferred", summary: "Create a folder." },
  { name: "hanokiCreateChat", group: "write", access: "deferred", summary: "Create a chat." },
  {
    name: "hanokiListModels",
    group: "write",
    access: "deferred",
    summary: "List enabled models for use with hanokiSendMessage.",
  },
  {
    name: "hanokiSendMessage",
    group: "write",
    access: "deferred",
    summary: "Append a user message to another chat, optionally starting a reply.",
  },
  {
    name: "hanokiCreateMarkdown",
    group: "write",
    access: "deferred",
    summary: "Create a markdown note, optionally with a body.",
  },
  {
    name: "hanokiMoveItems",
    group: "write",
    access: "deferred",
    summary: "Move items or folders to another folder.",
  },
  {
    name: "hanokiRenameItem",
    group: "write",
    access: "deferred",
    summary: "Rename a chat, note, terminal, or folder.",
  },
  {
    name: "hanokiEditNote",
    group: "write",
    access: "deferred",
    summary: "Replace or append to a markdown note's content.",
  },
  {
    name: "hanokiDeleteItems",
    group: "write",
    access: "deferred",
    summary: "Permanently delete items or folders (recursive for folders).",
  },
  {
    name: "hanokiCreateTerminal",
    group: "terminal",
    access: "deferred",
    summary: "Create a Hanoki terminal item in the workspace.",
  },
  {
    name: "hanokiTerminalGet",
    group: "terminal",
    access: "deferred",
    summary: "Start a Hanoki terminal if needed and fetch its status and recent output.",
  },
  {
    name: "hanokiTerminalRun",
    group: "terminal",
    access: "deferred",
    summary: "Run a command in a Hanoki terminal and return new output.",
  },
  {
    name: "hanokiTerminalWrite",
    group: "terminal",
    access: "deferred",
    summary: "Write raw input (keys/text) to a Hanoki terminal.",
  },
  {
    name: "hanokiTerminalInterrupt",
    group: "terminal",
    access: "deferred",
    summary: "Send Ctrl-C to a Hanoki terminal.",
  },
] as const;

export function searchHanokiToolCatalog(query: string): HanokiToolCatalogEntry[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return [...HANOKI_TOOL_CATALOG];
  const scored = HANOKI_TOOL_CATALOG.map((entry) => {
    const haystack = `${entry.name} ${entry.group} ${entry.summary}`.toLowerCase();
    const score = tokens.filter((token) => haystack.includes(token)).length;
    return { entry, score };
  }).filter(({ score }) => score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ entry }) => entry);
}

function addDiscoveredFromOutput(output: unknown, found: Set<string>): void {
  const known = new Set(HANOKI_TOOL_CATALOG.map((entry) => entry.name));
  const tools = (output as { tools?: unknown[] } | null)?.tools;
  if (!Array.isArray(tools)) return;
  for (const entry of tools) {
    const name = (entry as { name?: unknown } | null)?.name;
    if (typeof name === "string" && known.has(name)) found.add(name);
  }
}

/** Tool names discovered so far via hanokiFindTools results in prior steps of this call. */
export function collectDiscoveredHanokiTools(steps: readonly unknown[]): string[] {
  const found = new Set<string>();
  for (const step of steps) {
    const results = (step as { toolResults?: unknown[] } | null)?.toolResults;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      const record = result as { toolName?: unknown; output?: unknown } | null;
      if (!record || record.toolName !== "hanokiFindTools") continue;
      addDiscoveredFromOutput(record.output, found);
    }
  }
  return [...found];
}

/**
 * Tool names discovered in earlier requests of this conversation. Approval
 * resumptions and follow-up turns start a fresh agent call with empty steps,
 * so discovery must also be recovered from hanokiFindTools results already
 * present in the message history — otherwise loaded tools drop out between
 * calls and the model has to search again before every step.
 */
export function collectDiscoveredHanokiToolsFromMessages(
  messages: readonly { parts?: readonly unknown[] }[],
): string[] {
  const found = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      const record = part as {
        type?: unknown;
        toolName?: unknown;
        output?: unknown;
      } | null;
      if (!record) continue;
      const toolName =
        record.type === "dynamic-tool"
          ? record.toolName
          : typeof record.type === "string" && record.type.startsWith("tool-")
            ? record.type.slice("tool-".length)
            : null;
      if (toolName !== "hanokiFindTools") continue;
      addDiscoveredFromOutput(record.output, found);
    }
  }
  return [...found];
}

interface FlushedNote {
  id: string;
  workspaceId: string;
  title: string;
  type: "markdown";
  data: { markdown: string };
}

function flushStoredMarkdown(id: string): FlushedNote {
  const item = getItemById(id);
  if (!item || item.type !== "markdown") {
    throw new Error(`Item "${id}" is not a note.`);
  }
  return item;
}

function parseItemTitle(kind: Exclude<ItemKind, "folder">, newName: string): string {
  const parsed = parseChatTitle(newName);
  if (!parsed.ok) {
    throw new Error(parsed.error.replace("Chat", itemKindLabel(kind)));
  }
  return parsed.value;
}

export function createHanokiTools({
  workspaceId,
  chatId,
  onTreeChanged,
  onMessagesChanged,
  onGenerationRequested,
  flushMarkdownContent = flushStoredMarkdown,
  flushMarkdownEditors = flushOpenMarkdownEditorsInRenderer,
  terminals,
}: {
  workspaceId: string;
  chatId: string;
  onTreeChanged?: () => void;
  onMessagesChanged?: (chatId: string) => void;
  onGenerationRequested?: (chatId: string, modelId: string) => void;
  flushMarkdownContent?: (id: string) => FlushedNote;
  flushMarkdownEditors?: () => Promise<void>;
  terminals?: HanokiTerminalPort;
}) {
  const requireTerminals = (): HanokiTerminalPort => {
    if (!terminals) throw new Error("Hanoki terminals are not available in this session.");
    return terminals;
  };
  const requireTerminalItem = (terminalId: string) => {
    const row = getItemById(terminalId);
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error(`Terminal "${terminalId}" does not exist in this workspace.`);
    }
    if (row.type !== "terminal") throw new Error(`Item "${terminalId}" is not a terminal.`);
    return row;
  };
  const treeChanged = <T>(result: T): T => {
    onTreeChanged?.();
    return result;
  };

  function readChatPage(input: { chatId: string; limit: number; beforeMessageId?: string | null }) {
    const target = getChatById(input.chatId);
    if (!target || target.workspaceId !== workspaceId) {
      throw new Error(`Chat "${input.chatId}" does not exist in this workspace.`);
    }
    const limit = Math.min(100, Math.max(1, input.limit));
    const branch = listMessagesByChatId(input.chatId, getChatCurrentBranchId(input.chatId));
    const normalizedBeforeMessageId = normalizeNullableString(input.beforeMessageId);
    const end =
      normalizedBeforeMessageId === null
        ? branch.length
        : branch.findIndex((message) => message.id === normalizedBeforeMessageId);
    if (end < 0) {
      throw new Error(`Message "${normalizedBeforeMessageId}" is not on the selected chat branch.`);
    }
    const start = Math.max(0, end - limit);
    const page = branch.slice(start, end).map((message) => ({
      id: message.id,
      role: message.role,
      content: getStoredMessageText(message),
      createdAt: message.createdAt,
    }));
    const capped = capChatMessages(page);
    const oldestIncluded = capped.messages[0];
    const hasOlder = start > 0 || capped.messages.length < page.length;
    return {
      chat: summarizeItem(
        workspaceId,
        { kind: "chat", id: input.chatId },
        getFolderPaths(workspaceId),
      ),
      messages: capped.messages,
      truncated: capped.truncated,
      nextBeforeMessageId: hasOlder && oldestIncluded ? oldestIncluded.id : null,
    };
  }

  const chatReadSchema = jsonSchema<{
    chatId: string;
    limit: number;
    beforeMessageId?: string | null;
  }>({
    type: "object",
    properties: {
      chatId: {
        type: "string",
        minLength: 1,
        description: "Exact chat ID from an attached context pointer or another Hanoki tool.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Maximum number of messages to return, from 1 to 100.",
      },
      beforeMessageId: {
        type: ["string", "null"],
        default: null,
        description:
          "Return the page older than this message ID. Pass nextBeforeMessageId from the previous result. Omit for the latest page. Repeat until nextBeforeMessageId is null.",
      },
    },
    required: ["chatId", "limit"],
    additionalProperties: false,
  });

  const chatReadDescription = `Read messages from a chat in the current Hanoki workspace. Returns the latest page of the selected branch by default, in conversation order, at most 100 messages and ${HANOKI_READ_CHAR_CEILING} characters of message text. A truncated page ends with a truncation marker and sets truncated to true. Walk older history by calling again with beforeMessageId set to nextBeforeMessageId until that field is null. Does not modify the chat.`;

  return {
    hanokiFindTools: tool({
      description:
        "Search for additional Hanoki tools by describing the goal (for example 'delete a note', 'run a command in a terminal', 'edit a note'). Matching tools become available on the next step. Core read tools are already available; use this before concluding a write or terminal action is impossible.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            description: "What you are trying to do, in plain words.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: ({ query }) => ({
        query,
        tools: searchHanokiToolCatalog(query).map(({ name, group, summary }) => ({
          name,
          group,
          summary,
        })),
      }),
    }),

    hanokiGetItem: tool({
      description:
        "Get detailed information about one Hanoki item or folder by exact ID returned by browse, search, or create tools. Returns its kind, title, folder path, timestamps, and kind-specific detail: message count and settings for chats, capped content for notes, and shell/working directory for terminals. Use hanokiReadNote/hanokiReadChat for full bodies and hanokiTerminalGet for live terminal output.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        properties: {
          id: {
            type: "string",
            minLength: 1,
            description: "Exact item or folder ID returned by a Hanoki tool.",
          },
        },
        required: ["id"],
        additionalProperties: false,
      }),
      execute: ({ id }) => {
        const folderPaths = getFolderPaths(workspaceId);
        const folder = getFolderById(id);
        if (folder && folder.workspaceId === workspaceId) {
          const children = getChatTreeChildren(workspaceId, folder.id);
          return {
            kind: "folder" as const,
            id: folder.id,
            name: folder.name,
            title: folder.name,
            parentFolderId: folder.parentId,
            path: folderPaths.get(folder.id) ?? folder.name,
            location: getFolderLocation(workspaceId, folder.parentId),
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
            childFolderCount: children.folders.length,
            childItemCount: children.items.length,
          };
        }
        const row = getItemById(id);
        if (!row || row.workspaceId !== workspaceId) {
          throw new Error(`Item "${id}" does not exist in this workspace.`);
        }
        const base = {
          ...summarizeItem(workspaceId, { kind: row.type, id: row.id }, folderPaths),
          title: row.title,
          createdAt: row.createdAt,
          location: getFolderLocation(workspaceId, row.folderId),
        };
        if (row.type === "chat") {
          return {
            ...base,
            currentBranchId: getChatCurrentBranchId(row.id),
            messageCount: listAllMessagesByChatId(row.id).length,
            settings: {
              modelId: row.data.settings.modelId ?? null,
              webEnabled: Boolean(row.data.settings.webEnabled),
              hanokiEnabled: Boolean(row.data.settings.hanokiEnabled),
              terminalEnabled: Boolean(row.data.settings.terminalEnabled),
            },
          };
        }
        if (row.type === "markdown") {
          const flushed = flushMarkdownContent(row.id);
          const capped = capReadText(flushed.data.markdown ?? "");
          return {
            ...base,
            content: capped.text,
            contentLength: (flushed.data.markdown ?? "").length,
            truncated: capped.truncated,
          };
        }
        return {
          ...base,
          workingDirectory: row.data.workingDirectory,
          shell: row.data.shell,
          columns: row.data.columns,
          rows: row.data.rows,
          scrollbackLength: row.data.scrollback.length,
        };
      },
    }),

    hanokiBrowseItems: tool({
      description:
        "Browse chats, markdown notes, terminals, and folders in the current Hanoki workspace. Use this to inspect the root or the direct children of a known folder and to obtain exact IDs for other Hanoki tools. This does not search message content or modify anything.",
      inputSchema: jsonSchema<{
        parentFolderId: string | null;
        kind: BrowseKind;
        limit: number;
        cursor?: string | null;
      }>({
        type: "object",
        properties: {
          parentFolderId: {
            type: ["string", "null"],
            description: "Folder to browse, or null for the workspace root.",
          },
          kind: {
            type: "string",
            enum: ["all", ...itemKindEnum],
            description: "Which item kinds to return.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Maximum number of items to return, from 1 to 100.",
          },
          cursor: {
            type: ["string", "null"],
            default: null,
            description: "Pagination cursor from a previous result. Omit for the first page.",
          },
        },
        required: ["parentFolderId", "kind", "limit"],
        additionalProperties: false,
      }),
      execute: ({ parentFolderId, kind, limit, cursor = null }) => {
        const normalizedParentFolderId = normalizeNullableString(parentFolderId);
        const offset = parseCursor(cursor);
        const slice = getChatTreeChildren(workspaceId, normalizedParentFolderId);
        const folderPaths = getFolderPaths(workspaceId);
        const includeFolders = kind === "all" || kind === "folder";
        const items = [
          ...(includeFolders
            ? slice.folders.map((folder) => ({
                kind: "folder" as const,
                id: folder.id,
                name: folder.name,
                parentFolderId: folder.parentId,
                path: folderPaths.get(folder.id) ?? folder.name,
                updatedAt: folder.updatedAt,
                childFolderCount: folder.childFolderCount,
                childItemCount: folder.childItemCount,
              }))
            : []),
          ...(kind === "folder"
            ? []
            : slice.items
                .filter((item) => kind === "all" || item.type === kind)
                .map((item) =>
                  summarizeItem(workspaceId, { kind: item.type, id: item.id }, folderPaths),
                )),
        ];
        const page = items.slice(offset, offset + limit);
        return {
          parentFolderId: normalizedParentFolderId,
          items: page,
          nextCursor: offset + page.length < items.length ? String(offset + page.length) : null,
        };
      },
    }),

    hanokiSearchChats: tool({
      description:
        "Search chat titles and message content in the current Hanoki workspace. Use this when the user wants to find relevant or related chats rather than browse a known folder. Results contain short matching snippets and exact chat IDs; use hanokiGetChatContent to read a result in context.",
      inputSchema: jsonSchema<{ query: string; limit: number; cursor?: string | null }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            description: "Plain text to find in chat titles or messages.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Maximum number of chats to return, from 1 to 100.",
          },
          cursor: {
            type: ["string", "null"],
            default: null,
            description: "Pagination cursor from a previous result. Omit for the first page.",
          },
        },
        required: ["query", "limit"],
        additionalProperties: false,
      }),
      execute: ({ query, limit, cursor = null }) => {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) throw new Error("Search query cannot be empty.");
        const offset = parseCursor(cursor);
        const matches = searchWorkspaceChats(workspaceId, normalizedQuery, limit + 1, offset);
        const hasMore = matches.length > limit;
        const folderPaths = getFolderPaths(workspaceId);
        return {
          query: normalizedQuery,
          chats: matches.slice(0, limit).map((chat) => ({
            id: chat.id,
            title: chat.title,
            folderId: chat.folderId,
            path: chat.folderId
              ? `${folderPaths.get(chat.folderId) ?? ""}/${chat.title}`.replace(/^\//, "")
              : chat.title,
            updatedAt: chat.updatedAt,
            snippets: listAllMessagesByChatId(chat.id)
              .map((message) => getSnippet(getStoredMessageText(message), normalizedQuery))
              .filter((snippet): snippet is string => snippet !== null)
              .slice(0, 2),
          })),
          nextCursor: hasMore ? String(offset + limit) : null,
        };
      },
    }),

    hanokiGetChatContent: tool({
      description: chatReadDescription,
      inputSchema: chatReadSchema,
      execute: (input) => readChatPage(input),
    }),

    hanokiReadNote: tool({
      description: `Read a markdown note in the current workspace by exact note id. Flushes unsaved editor text before reading. Returns at most ${HANOKI_READ_CHAR_CEILING} characters; longer notes include a truncation marker and are not returned in full. Fails if the id is missing, in another workspace, or not a note.`,
      inputSchema: jsonSchema<{ noteId: string }>({
        type: "object",
        properties: {
          noteId: {
            type: "string",
            minLength: 1,
            description: "Exact note id from an attached context pointer.",
          },
        },
        required: ["noteId"],
        additionalProperties: false,
      }),
      execute: ({ noteId }) => {
        const existing = getItemById(noteId);
        if (!existing || existing.workspaceId !== workspaceId) {
          throw new Error(`Note "${noteId}" does not exist in this workspace.`);
        }
        if (existing.type !== "markdown") {
          throw new Error(`Item "${noteId}" is not a note.`);
        }
        const flushed = (flushMarkdownContent ?? flushStoredMarkdown)(noteId);
        if (flushed.type !== "markdown" || flushed.workspaceId !== workspaceId) {
          throw new Error(`Note "${noteId}" does not exist in this workspace.`);
        }
        const capped = capReadText(flushed.data.markdown ?? "");
        return {
          kind: "note" as const,
          itemId: flushed.id,
          title: flushed.title,
          content: capped.text,
          truncated: capped.truncated,
        };
      },
    }),

    hanokiReadChat: tool({
      description: `${chatReadDescription} Refuses the chat hosting this turn: that conversation is already in context, and the in-flight turn is not a stable snapshot.`,
      inputSchema: chatReadSchema,
      execute: (input) => {
        if (input.chatId.trim() === chatId) {
          throw new Error(
            "Cannot read the chat hosting this turn. Its messages are already in the conversation.",
          );
        }
        return readChatPage(input);
      },
    }),

    hanokiGetCurrentFolder: tool({
      description:
        "Get this chat's folder — the parent folder of the chat hosting this turn. Use this when the user wants to create or place something in the same folder as this chat. Returns the folder ID and path; null folderId means the workspace root. This does not use the focused UI tab.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: () => {
        const chat = getChatById(chatId);
        if (!chat || chat.workspaceId !== workspaceId) {
          throw new Error(`Chat "${chatId}" does not exist in this workspace.`);
        }
        return { workspaceId, chatId, ...getFolderLocation(workspaceId, chat.folderId) };
      },
    }),

    hanokiGetItemLocation: tool({
      description:
        "Get the folder of a chat, markdown note, or terminal by exact item ID. Returns the folder ID and path; null folderId means the workspace root.",
      inputSchema: jsonSchema<{ itemId: string }>({
        type: "object",
        properties: {
          itemId: {
            type: "string",
            minLength: 1,
            description: "Exact chat, note, or terminal ID returned by a Hanoki tool.",
          },
        },
        required: ["itemId"],
        additionalProperties: false,
      }),
      execute: ({ itemId }) => {
        const row = getItemById(itemId);
        if (!row || row.workspaceId !== workspaceId) {
          throw new Error(`Item "${itemId}" does not exist in this workspace.`);
        }
        return {
          workspaceId,
          itemId: row.id,
          kind: row.type,
          ...getFolderLocation(workspaceId, row.folderId),
        };
      },
    }),

    hanokiCreateFolder: tool({
      description:
        "Create one folder in the current Hanoki workspace. Use this when a folder is needed to fulfill the user's explicit organization request. Pass an exact parent folder ID returned by a Hanoki tool, or null to create it at the workspace root. The name is trimmed and validated before saving.",
      strict: true,
      inputSchema: jsonSchema<{ name: string; parentFolderId: string | null }>({
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 128,
            description: "Name for the new folder.",
          },
          parentFolderId: {
            type: ["string", "null"],
            description: "Exact parent folder ID, or null for the workspace root.",
          },
        },
        required: ["name", "parentFolderId"],
        additionalProperties: false,
      }),
      execute: ({ name, parentFolderId }) => {
        const parsed = parseFolderName(name);
        if (!parsed.ok) throw new Error(parsed.error);
        const folder = createFolder({
          workspaceId,
          name: parsed.value,
          parentId: normalizeNullableString(parentFolderId),
        });
        return treeChanged({
          ...summarizeItem(
            workspaceId,
            { kind: "folder", id: folder.id },
            getFolderPaths(workspaceId),
          ),
          ancestorFolderIds: getFolderPathSegments(workspaceId, folder.parentId).map(
            (segment) => segment.id,
          ),
        });
      },
    }),

    hanokiCreateChat: tool({
      description:
        "Create one chat in the current Hanoki workspace. Use this when the user explicitly asks to create a chat. Pass an exact folder ID returned by a Hanoki tool, or null to create it at the workspace root. The title is trimmed and validated before saving.",
      strict: true,
      inputSchema: jsonSchema<{ title: string; folderId: string | null }>({
        type: "object",
        properties: {
          title: {
            type: "string",
            minLength: 1,
            maxLength: 256,
            description: "Title for the new chat.",
          },
          folderId: {
            type: ["string", "null"],
            description: "Exact parent folder ID, or null for the workspace root.",
          },
        },
        required: ["title", "folderId"],
        additionalProperties: false,
      }),
      execute: ({ title, folderId }) => {
        const parsed = parseChatTitle(title);
        if (!parsed.ok) throw new Error(parsed.error);
        const chat = createChat({
          workspaceId,
          title: parsed.value,
          folderId: normalizeNullableString(folderId),
        });
        return treeChanged(
          summarizeItem(workspaceId, { kind: "chat", id: chat.id }, getFolderPaths(workspaceId)),
        );
      },
    }),

    hanokiListModels: tool({
      description:
        "List models that are enabled and active. Use a returned id as modelId when starting a reply with hanokiSendMessage. This does not change settings.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
      execute: () => ({
        models: listEnabledModels().map((model) => ({
          id: model.id,
          providerId: model.providerId,
          providerModelId: model.providerModelId,
          displayName: model.displayName,
        })),
      }),
    }),

    hanokiSendMessage: tool({
      description:
        "Append one user message to an explicit chat in the current Hanoki workspace. Pass the exact chat ID from a Hanoki browse, search, or create result. kick defaults to false and only saves a draft. Set kick to true to ask the app to start one reply in that other chat after the draft is saved. kick cannot target this chat, a chat that is already generating, or more than one chat. Optional modelId must be an enabled active model from hanokiListModels; otherwise the target chat's saved model is used.",
      strict: true,
      inputSchema: jsonSchema<{
        chatId: string;
        text: string;
        kick?: boolean;
        modelId?: string | null;
      }>({
        type: "object",
        properties: {
          chatId: {
            type: "string",
            minLength: 1,
            description: "Exact chat ID returned by a Hanoki tool. Required.",
          },
          text: {
            type: "string",
            minLength: 1,
            description: "The user message text to save.",
          },
          kick: {
            type: "boolean",
            default: false,
            description:
              "When true, start one reply in that chat after saving. Defaults to false (draft only).",
          },
          modelId: {
            type: ["string", "null"],
            default: null,
            description:
              "Optional enabled active model id from hanokiListModels. Used only when kick is true.",
          },
        },
        required: ["chatId", "text"],
        additionalProperties: false,
      }),
      execute: ({ chatId: targetChatId, text, kick = false, modelId = null }) => {
        const normalizedChatId = targetChatId.trim();
        if (!normalizedChatId) {
          throw new Error("Chat ID is required.");
        }
        const trimmedText = text.trim();
        if (!trimmedText) {
          throw new Error("Message text cannot be empty.");
        }
        const target = getChatById(normalizedChatId);
        if (!target || target.workspaceId !== workspaceId) {
          throw new Error(`Chat "${normalizedChatId}" does not exist in this workspace.`);
        }
        const shouldKick = kick === true;
        let kickModelId: string | null = null;
        if (shouldKick) {
          if (normalizedChatId === chatId) {
            throw new Error("Cannot start a reply in the chat that is running this turn.");
          }
          if (isChatGenerationBusy(normalizedChatId)) {
            throw new Error(`Chat "${normalizedChatId}" is already generating a reply.`);
          }
          kickModelId = resolveKickModelId(
            normalizeNullableString(modelId),
            target.data.settings.modelId ?? null,
          );
        }
        const parentId =
          listMessagesByChatId(normalizedChatId, getChatCurrentBranchId(normalizedChatId)).at(-1)
            ?.id ?? null;
        const saved = upsertMessage({
          id: createUuidV7(),
          chatId: normalizedChatId,
          parentId,
          role: "user",
          parts: createTiptapMessageParts(createTiptapDocumentFromText(trimmedText)),
          metadata: { parentId },
        });
        setChatCurrentBranch(normalizedChatId, saved.id);
        onMessagesChanged?.(normalizedChatId);
        if (shouldKick && kickModelId) {
          reserveChatKick(normalizedChatId);
          onGenerationRequested?.(normalizedChatId, kickModelId);
        }
        return {
          chatId: normalizedChatId,
          title: target.title,
          messageId: saved.id,
          role: "user" as const,
          content: trimmedText,
          startedGeneration: shouldKick,
          modelId: kickModelId,
        };
      },
    }),

    hanokiCreateMarkdown: tool({
      description:
        "Create one markdown note in the current Hanoki workspace. Use this when the user explicitly asks to create a note. Pass an exact folder ID returned by a Hanoki tool, or null to create it at the workspace root. Optional body is saved immediately; omit it or pass null to create an empty note.",
      strict: true,
      inputSchema: jsonSchema<{ title: string; folderId: string | null; body?: string | null }>({
        type: "object",
        properties: {
          title: {
            type: "string",
            minLength: 1,
            maxLength: 256,
            description: "Title for the new markdown note.",
          },
          folderId: {
            type: ["string", "null"],
            description: "Exact parent folder ID, or null for the workspace root.",
          },
          body: {
            type: ["string", "null"],
            default: null,
            description: "Optional markdown body. Omit or pass null to create an empty note.",
          },
        },
        required: ["title", "folderId"],
        additionalProperties: false,
      }),
      execute: ({ title, folderId, body = null }) => {
        const parsed = parseChatTitle(title);
        if (!parsed.ok) throw new Error(parsed.error.replace("Chat", "Markdown item"));
        const normalizedBody = normalizeNullableString(body);
        if (normalizedBody !== null && normalizedBody.length > MAX_MARKDOWN_LENGTH) {
          throw new Error("Markdown content must be a string no larger than 5 MiB.");
        }
        const markdown = createMarkdown({
          workspaceId,
          title: parsed.value,
          folderId: normalizeNullableString(folderId),
        });
        if (normalizedBody !== null) updateMarkdownContent(markdown.id, normalizedBody);
        return treeChanged(
          summarizeItem(
            workspaceId,
            { kind: "markdown", id: markdown.id },
            getFolderPaths(workspaceId),
          ),
        );
      },
    }),

    hanokiMoveItems: tool({
      description:
        "Move one or more chats, markdown notes, terminals, or folders to one destination in the current Hanoki workspace. Use this only when the user explicitly asks to apply a reorganization, not when they only ask for suggestions. Pass exact IDs returned by Hanoki tools; null moves the items to the workspace root, and selected descendants remain inside a selected parent folder.",
      strict: true,
      inputSchema: jsonSchema<{ items: ItemRef[]; destinationFolderId: string | null }>({
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: itemRefSchema,
            description: "One to fifty exact chats, notes, terminals, or folders to move.",
          },
          destinationFolderId: {
            type: ["string", "null"],
            description: "Exact destination folder ID, or null for the workspace root.",
          },
        },
        required: ["items", "destinationFolderId"],
        additionalProperties: false,
      }),
      execute: ({ items, destinationFolderId }) => {
        const normalizedDestinationFolderId = normalizeNullableString(destinationFolderId);
        const beforePaths = getFolderPaths(workspaceId);
        const previousFolderIds = new Map<string, string | null>();
        const result = moveChatTreeItems(
          workspaceId,
          items.map((item) => {
            previousFolderIds.set(
              item.id,
              summarizeItem(workspaceId, item, beforePaths).parentFolderId,
            );
            return toMoveRef(item);
          }),
          normalizedDestinationFolderId,
        );
        const folderPaths = getFolderPaths(workspaceId);
        return treeChanged({
          destinationFolderId: normalizedDestinationFolderId,
          moved: result.movedItems.map((item) => ({
            ...summarizeItem(workspaceId, toToolItem(workspaceId, item), folderPaths),
            previousFolderId: previousFolderIds.get(item.id) ?? null,
          })),
          unchanged: result.unchangedItems.map((item) =>
            summarizeItem(workspaceId, toToolItem(workspaceId, item), folderPaths),
          ),
          skipped: result.skippedItems.map(({ reason, ...item }) => ({
            ...summarizeItem(workspaceId, toToolItem(workspaceId, item), folderPaths),
            reason,
          })),
        });
      },
    }),

    hanokiRenameItem: tool({
      description:
        "Rename one chat, markdown note, terminal, or folder in the current Hanoki workspace. Use this only when the user explicitly asks to apply a rename, not when they only ask for title suggestions. Pass an exact ID returned by a Hanoki tool; the name is trimmed and validated before saving.",
      strict: true,
      inputSchema: jsonSchema<{ kind: ItemKind; id: string; newName: string }>({
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [...itemKindEnum],
            description: "The kind of item to rename.",
          },
          id: {
            type: "string",
            minLength: 1,
            description: "Exact item ID returned by a Hanoki tool.",
          },
          newName: {
            type: "string",
            minLength: 1,
            maxLength: 256,
            description: "The new chat title, note title, terminal title, or folder name.",
          },
        },
        required: ["kind", "id", "newName"],
        additionalProperties: false,
      }),
      execute: async ({ kind, id, newName }) => {
        const beforePaths = getFolderPaths(workspaceId);
        const before = summarizeItem(workspaceId, { kind, id }, beforePaths);
        if (kind === "folder") {
          const parsed = parseFolderName(newName);
          if (!parsed.ok) throw new Error(parsed.error);
          updateFolderName(id, parsed.value);
        } else if (kind === "chat") {
          updateChatTitle(id, parseItemTitle(kind, newName));
        } else {
          await flushMarkdownEditors();
          updateItemTitle(id, parseItemTitle(kind, newName));
        }
        return treeChanged({
          before,
          after: summarizeItem(workspaceId, { kind, id }, getFolderPaths(workspaceId)),
        });
      },
    }),

    hanokiEditNote: tool({
      description:
        "Edit a markdown note in the current workspace. mode 'replace' (default) replaces the whole body; mode 'append' adds content at the end. Flushes unsaved editor text first so edits apply to the latest content. Use hanokiReadNote first when you need the current body.",
      strict: true,
      inputSchema: jsonSchema<{ noteId: string; content: string; mode?: "replace" | "append" }>({
        type: "object",
        properties: {
          noteId: {
            type: "string",
            minLength: 1,
            description: "Exact note ID returned by a Hanoki tool.",
          },
          content: { type: "string", description: "Markdown to write (replace) or add (append)." },
          mode: {
            type: "string",
            enum: ["replace", "append"],
            default: "replace",
            description: "Replace the whole body or append at the end.",
          },
        },
        required: ["noteId", "content"],
        additionalProperties: false,
      }),
      execute: async ({ noteId, content, mode = "replace" }) => {
        const existing = getItemById(noteId);
        if (!existing || existing.workspaceId !== workspaceId) {
          throw new Error(`Note "${noteId}" does not exist in this workspace.`);
        }
        if (existing.type !== "markdown") throw new Error(`Item "${noteId}" is not a note.`);
        await flushMarkdownEditors();
        const flushed = flushMarkdownContent(noteId);
        const before = flushed.data.markdown ?? "";
        const next = mode === "append" ? `${before}${content}` : content;
        if (next.length > MAX_MARKDOWN_LENGTH) {
          throw new Error("Markdown content must be a string no larger than 5 MiB.");
        }
        const updated = updateMarkdownContent(noteId, next);
        return treeChanged({
          kind: "markdown" as const,
          id: updated.id,
          title: updated.title,
          mode,
          beforeLength: before.length,
          afterLength: next.length,
        });
      },
    }),

    hanokiDeleteItems: tool({
      description:
        "Permanently delete one or more chats, markdown notes, terminals, or folders in the current workspace. Deleting a folder deletes everything inside it recursively. This cannot be undone. Refuses to delete the chat hosting this turn. Pass exact IDs returned by Hanoki tools.",
      strict: true,
      inputSchema: jsonSchema<{ items: ItemRef[] }>({
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: itemRefSchema,
            description: "One to fifty exact items or folders to delete permanently.",
          },
        },
        required: ["items"],
        additionalProperties: false,
      }),
      execute: async ({ items }) => {
        if (items.some((item) => item.kind === "chat" && item.id === chatId)) {
          throw new Error("Cannot delete the chat hosting this turn.");
        }
        const folderPaths = getFolderPaths(workspaceId);
        const before = items.map((item) => summarizeItem(workspaceId, item, folderPaths));
        const result = deleteChatTreeItems(
          workspaceId,
          items.map((item) => toMoveRef(item)),
        );
        if (terminals) {
          for (const item of before) {
            if (item.kind === "terminal" && result.deletedItemIds.includes(item.id)) {
              await terminals.disposeItem(item.id);
            }
          }
          // Terminals inside deleted folders are gone too; dispose any known ones.
          for (const deletedId of result.deletedItemIds) {
            if (!before.some((item) => item.id === deletedId)) {
              await terminals.disposeItem(deletedId).catch(() => undefined);
            }
          }
        }
        return treeChanged({
          deleted: before,
          deletedItemIds: result.deletedItemIds,
          deletedFolderIds: result.deletedFolderIds,
        });
      },
    }),

    hanokiCreateTerminal: tool({
      description:
        "Create one Hanoki terminal item in the current workspace. The terminal starts lazily when first read or run. Pass an exact folder ID returned by a Hanoki tool, or null for the workspace root.",
      strict: true,
      inputSchema: jsonSchema<{ title: string; folderId: string | null }>({
        type: "object",
        properties: {
          title: {
            type: "string",
            minLength: 1,
            maxLength: 256,
            description: "Title for the new terminal.",
          },
          folderId: {
            type: ["string", "null"],
            description: "Exact parent folder ID, or null for the workspace root.",
          },
        },
        required: ["title", "folderId"],
        additionalProperties: false,
      }),
      execute: ({ title, folderId }) => {
        const parsed = parseChatTitle(title);
        if (!parsed.ok) throw new Error(parsed.error.replace("Chat", "Terminal"));
        const created = requireTerminals().create({
          workspaceId,
          title: parsed.value,
          folderId: normalizeNullableString(folderId),
        });
        return treeChanged(
          summarizeItem(
            workspaceId,
            { kind: "terminal", id: created.id },
            getFolderPaths(workspaceId),
          ),
        );
      },
    }),

    hanokiTerminalGet: tool({
      description:
        "Get a Hanoki terminal's status and recent plain-text output by exact terminal ID. Starts the terminal's shell if it is not running yet. Use after hanokiTerminalRun when output was truncated or the command is still running.",
      inputSchema: jsonSchema<{ terminalId: string }>({
        type: "object",
        properties: {
          terminalId: {
            type: "string",
            minLength: 1,
            description: "Exact terminal ID returned by a Hanoki tool.",
          },
        },
        required: ["terminalId"],
        additionalProperties: false,
      }),
      execute: async ({ terminalId }) => {
        const row = requireTerminalItem(terminalId);
        const output = await requireTerminals().getOutput(terminalId);
        return {
          kind: "terminal" as const,
          id: row.id,
          title: row.title,
          workingDirectory: row.data.workingDirectory,
          shell: row.data.shell,
          ...output,
        };
      },
    }),

    hanokiTerminalRun: tool({
      description:
        "Run one shell command inside a Hanoki terminal item (its persistent PTY shell, working directory, and scrollback) and return the new plain-text output. Waits until the command actually finishes or timeoutMs elapses. timedOut true means the wait elapsed and the command may still be running — fetch later output with hanokiTerminalGet or stop it with hanokiTerminalInterrupt. timedOut false with a commandExitCode means the command finished with that exit code.",
      strict: true,
      inputSchema: jsonSchema<{ terminalId: string; command: string; timeoutMs?: number }>({
        type: "object",
        properties: {
          terminalId: {
            type: "string",
            minLength: 1,
            description: "Exact terminal ID returned by a Hanoki tool.",
          },
          command: {
            type: "string",
            minLength: 1,
            description: "Shell command to run in the terminal.",
          },
          timeoutMs: {
            type: "integer",
            minimum: 1000,
            maximum: 120000,
            description: "Max milliseconds to wait for the command to finish. Defaults to 30000.",
          },
        },
        required: ["terminalId", "command"],
        additionalProperties: false,
      }),
      execute: async ({ terminalId, command, timeoutMs }) => {
        const row = requireTerminalItem(terminalId);
        const result = await requireTerminals().runCommand(terminalId, command, timeoutMs);
        return { kind: "terminal" as const, id: row.id, title: row.title, ...result };
      },
    }),

    hanokiTerminalWrite: tool({
      description:
        "Write raw input to a Hanoki terminal, for interactive prompts or key presses (for example 'y\\n' or an arrow key escape sequence). Starts the terminal if needed. Prefer hanokiTerminalRun for ordinary commands.",
      strict: true,
      inputSchema: jsonSchema<{ terminalId: string; data: string }>({
        type: "object",
        properties: {
          terminalId: {
            type: "string",
            minLength: 1,
            description: "Exact terminal ID returned by a Hanoki tool.",
          },
          data: {
            type: "string",
            minLength: 1,
            description: "Raw text/keys to write to the terminal.",
          },
        },
        required: ["terminalId", "data"],
        additionalProperties: false,
      }),
      execute: async ({ terminalId, data }) => {
        const row = requireTerminalItem(terminalId);
        const output = await requireTerminals().writeInput(terminalId, data);
        return { kind: "terminal" as const, id: row.id, title: row.title, ...output };
      },
    }),

    hanokiTerminalInterrupt: tool({
      description:
        "Interrupt what a Hanoki terminal is running by sending Ctrl-C, then return its latest output.",
      strict: true,
      inputSchema: jsonSchema<{ terminalId: string }>({
        type: "object",
        properties: {
          terminalId: {
            type: "string",
            minLength: 1,
            description: "Exact terminal ID returned by a Hanoki tool.",
          },
        },
        required: ["terminalId"],
        additionalProperties: false,
      }),
      execute: async ({ terminalId }) => {
        const row = requireTerminalItem(terminalId);
        const output = await requireTerminals().interrupt(terminalId);
        return { kind: "terminal" as const, id: row.id, title: row.title, ...output };
      },
    }),
  };
}

export const HANOKI_READ_TOOL_NAMES = ["hanokiReadNote", "hanokiReadChat"] as const;

export const HANOKI_TOOL_NAMES = HANOKI_TOOL_CATALOG.map((entry) => entry.name);

export const HANOKI_CORE_TOOL_NAMES = HANOKI_TOOL_CATALOG.filter(
  (entry) => entry.access === "core",
).map((entry) => entry.name);

export const HANOKI_DEFERRED_TOOL_NAMES = HANOKI_TOOL_CATALOG.filter(
  (entry) => entry.access === "deferred",
).map((entry) => entry.name);
