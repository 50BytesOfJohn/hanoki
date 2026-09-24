import { IPC_CHANNELS, type ItemInfo } from "@shared/ipc";
import { parseChatId } from "@shared/chat/chat-id";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderId } from "@shared/folder/folder-id";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

function itemId(value: unknown): string {
  const parsed = parseChatId(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error.replace("Chat", "Item"));
  return parsed.value;
}

function title(value: unknown): string {
  const parsed = parseChatTitle(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error.replace("Chat", "Item"));
  return parsed.value;
}

function folderId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = parseFolderId(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error);
  return parsed.value;
}

function count(args: unknown[], expected: number): void {
  if (args.length !== expected) {
    throw AppError.badRequest(`Expected ${expected} IPC arguments, received ${args.length}.`);
  }
}

export function registerItemsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string], ItemInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.items.get,
    parseArgs: (args) => {
      count(args, 1);
      return [itemId(args[0])];
    },
    handler: ({ services }, _event, id) => services.chatTree.getItem(id),
  });
  registerInvokeHandler<[string, string], ItemInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.items.updateTitle,
    parseArgs: (args) => {
      count(args, 2);
      return [itemId(args[0]), title(args[1])];
    },
    handler: ({ services }, _event, id, nextTitle) =>
      services.chatTree.updateItemTitle(id, nextTitle),
  });
  registerInvokeHandler<[string, string | null], ItemInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.items.move,
    parseArgs: (args) => {
      count(args, 2);
      return [itemId(args[0]), folderId(args[1])];
    },
    handler: ({ services }, _event, id, nextFolderId) =>
      services.chatTree.moveItem(id, nextFolderId),
  });
  registerInvokeHandler<[string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.items.delete,
    parseArgs: (args) => {
      count(args, 1);
      return [itemId(args[0])];
    },
    handler: async ({ services }, _event, id) => {
      await services.terminals.disposeItem(id);
      services.chatTree.deleteItem(id);
    },
  });
}
