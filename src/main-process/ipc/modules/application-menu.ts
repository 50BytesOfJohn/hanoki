import { IPC_CHANNELS } from "@shared/ipc";
import { setUnreadChatCount } from "../../app/application-menu";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

function parseUnreadChatCount(args: unknown[]): [number] {
  const [count] = args;
  if (args.length !== 1 || !Number.isInteger(count) || (count as number) < 0) {
    throw AppError.badRequest("Unread chat count must be a non-negative integer.");
  }
  return [count as number];
}

export function registerApplicationMenuIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[number], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.applicationMenu.setUnreadChatCount,
    parseArgs: parseUnreadChatCount,
    handler: (_handlerContext, _event, count) => setUnreadChatCount(count),
  });
}
