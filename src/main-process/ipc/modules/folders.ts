import { IPC_CHANNELS, type FolderInfo } from "@shared/ipc";
import { parseFolderId } from "@shared/folder/folder-id";
import { parseFolderName } from "@shared/folder/folder-name";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

function expectArgCount(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(
      `Invalid IPC argument count. Expected ${min === max ? `${min}` : `${min}-${max}`}, received ${args.length}.`,
    );
  }
}

function parseValidWorkspaceId(input: unknown): string {
  const parsed = parseWorkspaceId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseValidFolderId(input: unknown): string {
  const parsed = parseFolderId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseNullableFolderId(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  return parseValidFolderId(input);
}

function parseValidFolderName(input: unknown): string {
  const parsed = parseFolderName(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

export function registerFoldersIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string, string, string | null], FolderInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.folders.create,
    parseArgs: (args) => {
      expectArgCount(args, 2, 3);
      return [
        parseValidWorkspaceId(args[0]),
        parseValidFolderName(args[1]),
        parseNullableFolderId(args[2]),
      ];
    },
    handler: ({ services }, _event, workspaceId, name, parentId) =>
      services.chatTree.createFolder({ workspaceId, name, parentId }),
  });

  registerInvokeHandler<[string, string], FolderInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.folders.updateName,
    parseArgs: (args) => {
      expectArgCount(args, 2);
      return [parseValidFolderId(args[0]), parseValidFolderName(args[1])];
    },
    handler: ({ services }, _event, id, name) => services.chatTree.updateFolderName(id, name),
  });

  registerInvokeHandler<[string, string | null], FolderInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.folders.move,
    parseArgs: (args) => {
      expectArgCount(args, 2);
      return [parseValidFolderId(args[0]), parseNullableFolderId(args[1])];
    },
    handler: ({ services }, _event, id, parentId) => services.chatTree.moveFolder(id, parentId),
  });

  registerInvokeHandler<[string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.folders.delete,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidFolderId(args[0])];
    },
    handler: ({ services }, _event, id) => services.chatTree.deleteFolder(id),
  });
}
