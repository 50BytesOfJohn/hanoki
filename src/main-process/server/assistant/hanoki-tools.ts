import { jsonSchema, tool, type JSONSchema7 } from "ai";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderName } from "@shared/folder/folder-name";
import { MAX_MARKDOWN_LENGTH } from "@shared/markdown/content";
import { getMessageDisplayText } from "@shared/tiptap/document";
import {
  createChat,
  createFolder,
  createMarkdown,
  getChatById,
  getChatCurrentBranchId,
  getChatTree,
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
import { listAllMessagesByChatId, listMessagesByChatId } from "../../messages/repository";

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

function getFolderPathSegments(
  workspaceId: string,
  folderId: string | null,
): { id: string; name: string }[] {
  if (folderId === null) return [];
  const segments: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let currentId: string | null = folderId;
  while (currentId !== null) {
    if (seen.has(currentId)) {
      throw new Error(`Folder "${folderId}" does not exist in this workspace.`);
    }
    seen.add(currentId);
    const folder = getFolderById(currentId);
    if (!folder || folder.workspaceId !== workspaceId) {
      throw new Error(`Folder "${currentId}" does not exist in this workspace.`);
    }
    segments.push({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }
  return segments.reverse();
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
}: {
  workspaceId: string;
  chatId: string;
}) {
  return {
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
      description:
        "Read messages from a chat in the current Hanoki workspace. Use this after browsing or searching when the chat's actual conversation is needed. It returns the latest page of the currently selected branch by default, with messages in conversation order, without modifying the chat.",
      inputSchema: jsonSchema<{
        chatId: string;
        limit: number;
        beforeMessageId?: string | null;
      }>({
        type: "object",
        properties: {
          chatId: {
            type: "string",
            minLength: 1,
            description: "Exact chat ID returned by a Hanoki tool.",
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
            description: "Return older messages before this message ID. Omit for the latest page.",
          },
        },
        required: ["chatId", "limit"],
        additionalProperties: false,
      }),
      execute: ({ chatId, limit, beforeMessageId = null }) => {
        const chat = getChatById(chatId);
        if (!chat || chat.workspaceId !== workspaceId) {
          throw new Error(`Chat "${chatId}" does not exist in this workspace.`);
        }
        const branch = listMessagesByChatId(chatId, getChatCurrentBranchId(chatId));
        const normalizedBeforeMessageId = normalizeNullableString(beforeMessageId);
        const end =
          normalizedBeforeMessageId === null
            ? branch.length
            : branch.findIndex((message) => message.id === normalizedBeforeMessageId);
        if (end < 0) {
          throw new Error(
            `Message "${normalizedBeforeMessageId}" is not on the selected chat branch.`,
          );
        }
        const start = Math.max(0, end - limit);
        const page = branch.slice(start, end);
        const folderPaths = getFolderPaths(workspaceId);
        return {
          chat: summarizeItem(workspaceId, { kind: "chat", id: chatId }, folderPaths),
          messages: page.map((message) => ({
            id: message.id,
            role: message.role,
            content: getStoredMessageText(message),
            createdAt: message.createdAt,
          })),
          nextBeforeMessageId: start > 0 ? (page[0]?.id ?? null) : null,
        };
      },
    }),

    hanokiGetCurrentFolder: tool({
      description:
        "Get the folder of the chat hosting this turn in the current Hanoki workspace. Use this when the user wants to create or place something in the same folder as this chat. Returns the folder ID and path; null folderId means the workspace root. This does not use the UI focused tab.",
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
        const folderId = chat.folderId;
        const path = getFolderPathSegments(workspaceId, folderId);
        return {
          workspaceId,
          chatId,
          folderId,
          path,
          pathString: folderId === null ? "" : (getFolderPaths(workspaceId).get(folderId) ?? ""),
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
        return summarizeItem(
          workspaceId,
          { kind: "folder", id: folder.id },
          getFolderPaths(workspaceId),
        );
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
        return summarizeItem(
          workspaceId,
          { kind: "chat", id: chat.id },
          getFolderPaths(workspaceId),
        );
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
        return summarizeItem(
          workspaceId,
          { kind: "markdown", id: markdown.id },
          getFolderPaths(workspaceId),
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
        const result = moveChatTreeItems(
          workspaceId,
          items.map((item) => {
            summarizeItem(workspaceId, item, beforePaths);
            return toMoveRef(item);
          }),
          normalizedDestinationFolderId,
        );
        const folderPaths = getFolderPaths(workspaceId);
        return {
          destinationFolderId: normalizedDestinationFolderId,
          moved: result.movedItems.map((item) =>
            summarizeItem(workspaceId, toToolItem(workspaceId, item), folderPaths),
          ),
          unchanged: result.unchangedItems.map((item) =>
            summarizeItem(workspaceId, toToolItem(workspaceId, item), folderPaths),
          ),
          skipped: result.skippedItems.map(({ reason, ...item }) => ({
            ...summarizeItem(workspaceId, toToolItem(workspaceId, item), folderPaths),
            reason,
          })),
        };
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
      execute: ({ kind, id, newName }) => {
        const beforePaths = getFolderPaths(workspaceId);
        const before = summarizeItem(workspaceId, { kind, id }, beforePaths);
        if (kind === "folder") {
          const parsed = parseFolderName(newName);
          if (!parsed.ok) throw new Error(parsed.error);
          updateFolderName(id, parsed.value);
        } else if (kind === "chat") {
          updateChatTitle(id, parseItemTitle(kind, newName));
        } else {
          updateItemTitle(id, parseItemTitle(kind, newName));
        }
        return {
          before,
          after: summarizeItem(workspaceId, { kind, id }, getFolderPaths(workspaceId)),
        };
      },
    }),
  };
}

export const HANOKI_TOOL_NAMES = [
  "hanokiBrowseItems",
  "hanokiSearchChats",
  "hanokiGetChatContent",
  "hanokiGetCurrentFolder",
  "hanokiCreateFolder",
  "hanokiCreateChat",
  "hanokiCreateMarkdown",
  "hanokiMoveItems",
  "hanokiRenameItem",
] as const;

/** Move/rename pause for Allow once. No dedicated auto-approve setting this slice. */
export const HANOKI_MUTATING_TOOL_NAMES = ["hanokiMoveItems", "hanokiRenameItem"] as const;
