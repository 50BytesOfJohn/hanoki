import { jsonSchema, tool, type JSONSchema7 } from "ai";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderName } from "@shared/folder/folder-name";
import { getMessageDisplayText } from "@shared/tiptap/document";
import {
  createFolder,
  getChatById,
  getChatCurrentBranchId,
  getChatTree,
  getChatTreeChildren,
  getFolderById,
  moveChatTreeItems,
  searchWorkspaceChats,
  updateChatTitle,
  updateFolderName,
  type ChatTreeFolderNode,
} from "../../chat-tree/repository";
import { listAllMessagesByChatId, listMessagesByChatId } from "../../messages/repository";

type ItemKind = "chat" | "folder";
type ItemRef = { kind: ItemKind; id: string };

const itemRefSchema: JSONSchema7 = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["chat", "folder"],
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

  const chat = getChatById(item.id);
  if (!chat || chat.workspaceId !== workspaceId) {
    throw new Error(`Chat "${item.id}" does not exist in this workspace.`);
  }
  const folderPath = chat.folderId ? folderPaths.get(chat.folderId) : undefined;
  return {
    kind: item.kind,
    id: chat.id,
    name: chat.title,
    parentFolderId: chat.folderId,
    path: folderPath ? `${folderPath}/${chat.title}` : chat.title,
    updatedAt: chat.updatedAt,
  };
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
  return getMessageDisplayText({ parts: message.parts as HanokiUiMessage["parts"] });
}

export function createHanokiTools(workspaceId: string) {
  return {
    hanokiBrowseItems: tool({
      description:
        "Browse chats and folders in the current Hanoki workspace. Use this to inspect the root or the direct children of a known folder and to obtain exact IDs for other Hanoki tools. This does not search message content or modify anything.",
      inputSchema: jsonSchema<{
        parentFolderId: string | null;
        kind: "all" | ItemKind;
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
            enum: ["all", "chat", "folder"],
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
        const items = [
          ...(kind === "chat"
            ? []
            : slice.folders.map((folder) => ({
                kind: "folder" as const,
                id: folder.id,
                name: folder.name,
                parentFolderId: folder.parentId,
                path: folderPaths.get(folder.id) ?? folder.name,
                updatedAt: folder.updatedAt,
                childFolderCount: folder.childFolderCount,
                childItemCount: folder.childItemCount,
              }))),
          ...(kind === "folder"
            ? []
            : slice.items
                .filter((item) => item.type === "chat")
                .map((chat) => ({
                  kind: "chat" as const,
                  id: chat.id,
                  name: chat.title,
                  parentFolderId: chat.folderId,
                  path: normalizedParentFolderId
                    ? `${folderPaths.get(normalizedParentFolderId) ?? ""}/${chat.title}`.replace(
                        /^\//,
                        "",
                      )
                    : chat.title,
                  updatedAt: chat.updatedAt,
                }))),
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

    hanokiMoveItems: tool({
      description:
        "Move one or more chats or folders to one destination in the current Hanoki workspace. Use this only when the user explicitly asks to apply a reorganization, not when they only ask for suggestions. Pass exact IDs returned by Hanoki tools; null moves the items to the workspace root, and selected descendants remain inside a selected parent folder.",
      strict: true,
      inputSchema: jsonSchema<{ items: ItemRef[]; destinationFolderId: string | null }>({
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: itemRefSchema,
            description: "One to fifty exact chats or folders to move.",
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
        const result = moveChatTreeItems(
          workspaceId,
          items.map((item) => ({
            kind: item.kind === "chat" ? ("item" as const) : ("folder" as const),
            id: item.id,
          })),
          normalizedDestinationFolderId,
        );
        const folderPaths = getFolderPaths(workspaceId);
        const toToolItem = (item: { kind: "item" | "folder"; id: string }): ItemRef => ({
          kind: item.kind === "item" ? "chat" : "folder",
          id: item.id,
        });
        return {
          destinationFolderId: normalizedDestinationFolderId,
          moved: result.movedItems.map((item) =>
            summarizeItem(workspaceId, toToolItem(item), folderPaths),
          ),
          unchanged: result.unchangedItems.map((item) =>
            summarizeItem(workspaceId, toToolItem(item), folderPaths),
          ),
          skipped: result.skippedItems.map(({ reason, ...item }) => ({
            ...summarizeItem(workspaceId, toToolItem(item), folderPaths),
            reason,
          })),
        };
      },
    }),

    hanokiRenameItem: tool({
      description:
        "Rename one chat or folder in the current Hanoki workspace. Use this only when the user explicitly asks to apply a rename, not when they only ask for title suggestions. Pass an exact ID returned by a Hanoki tool; the name is trimmed and validated before saving.",
      strict: true,
      inputSchema: jsonSchema<{ kind: ItemKind; id: string; newName: string }>({
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["chat", "folder"],
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
            description: "The new chat title or folder name.",
          },
        },
        required: ["kind", "id", "newName"],
        additionalProperties: false,
      }),
      execute: ({ kind, id, newName }) => {
        const beforePaths = getFolderPaths(workspaceId);
        const before = summarizeItem(workspaceId, { kind, id }, beforePaths);
        const parsed = kind === "chat" ? parseChatTitle(newName) : parseFolderName(newName);
        if (!parsed.ok) throw new Error(parsed.error);
        if (kind === "chat") updateChatTitle(id, parsed.value);
        else updateFolderName(id, parsed.value);
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
  "hanokiCreateFolder",
  "hanokiMoveItems",
  "hanokiRenameItem",
] as const;
