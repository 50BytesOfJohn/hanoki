import { IPC_CHANNELS, type TerminalInfo, type TerminalSessionSnapshot } from "@shared/ipc";
import { parseChatId } from "@shared/chat/chat-id";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderId } from "@shared/folder/folder-id";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

function count(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(`Expected ${min}-${max} IPC arguments, received ${args.length}.`);
  }
}

function id(value: unknown): string {
  const parsed = parseChatId(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error.replace("Chat", "Terminal"));
  return parsed.value;
}

function workspaceId(value: unknown): string {
  const parsed = parseWorkspaceId(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error);
  return parsed.value;
}

function title(value: unknown): string {
  const parsed = parseChatTitle(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error.replace("Chat", "Terminal"));
  return parsed.value;
}

function folderId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = parseFolderId(value);
  if (!parsed.ok) throw AppError.badRequest(parsed.error);
  return parsed.value;
}

function dimension(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2 || value > 1_000) {
    throw AppError.badRequest(`${label} must be an integer between 2 and 1000.`);
  }
  return value;
}

export function registerTerminalsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string, string, string | null], TerminalInfo>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.terminals.create,
      parseArgs: (args) => {
        count(args, 2, 3);
        return [workspaceId(args[0]), title(args[1]), folderId(args[2])];
      },
      handler: ({ services }, _event, workspace, nextTitle, folder) =>
        services.terminals.create({ workspaceId: workspace, title: nextTitle, folderId: folder }),
    },
  );
  registerInvokeHandler<[string], TerminalSessionSnapshot>(context, registeredChannels, {
    channel: IPC_CHANNELS.terminals.start,
    parseArgs: (args) => {
      count(args, 1);
      return [id(args[0])];
    },
    handler: ({ services }, event, itemId) => services.terminals.start(itemId, event.sender),
  });
  registerInvokeHandler<[string, string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.terminals.write,
    parseArgs: (args) => {
      count(args, 2);
      if (typeof args[1] !== "string" || args[1].length > 65_536) {
        throw AppError.badRequest("Terminal input must be a string no larger than 64 KiB.");
      }
      return [id(args[0]), args[1]];
    },
    handler: ({ services }, _event, itemId, data) => services.terminals.write(itemId, data),
  });
  registerInvokeHandler<[string, number, number], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.terminals.resize,
    parseArgs: (args) => {
      count(args, 3);
      return [id(args[0]), dimension(args[1], "columns"), dimension(args[2], "rows")];
    },
    handler: ({ services }, _event, itemId, columns, rows) =>
      services.terminals.resize(itemId, columns, rows),
  });
}
