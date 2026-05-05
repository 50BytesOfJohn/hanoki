import { ipcMain, type IpcMainInvokeEvent } from "electron";

import type { IpcHandlerContext } from "./context";
import { normalizeIpcError } from "./errors";

type IpcInvokeHandler<TArgs extends unknown[], TResult> = (
  context: IpcHandlerContext,
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => TResult | Promise<TResult>;

export interface InvokeHandlerDefinition<TArgs extends unknown[], TResult> {
  channel: string;
  parseArgs?: (args: unknown[]) => TArgs;
  handler: IpcInvokeHandler<TArgs, TResult>;
}

export function registerInvokeHandler<TArgs extends unknown[], TResult>(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
  definition: InvokeHandlerDefinition<TArgs, TResult>,
): void {
  if (registeredChannels.has(definition.channel)) {
    throw new Error(`Duplicate IPC channel registration: "${definition.channel}".`);
  }

  registeredChannels.add(definition.channel);

  ipcMain.handle(definition.channel, async (event, ...rawArgs) => {
    try {
      context.trustedSenders.assertTrustedIpcSender(event);

      const parsedArgs = definition.parseArgs ? definition.parseArgs(rawArgs) : (rawArgs as TArgs);
      return await definition.handler(context, event, ...parsedArgs);
    } catch (error) {
      const normalized = normalizeIpcError(error);
      const senderUrl = event.senderFrame?.url ?? event.sender.getURL() ?? "";

      console.error(
        `[ipc] ${definition.channel} failed (${normalized.code}) from sender ${event.sender.id} "${senderUrl || "unknown"}".`,
        error,
      );

      throw normalized;
    }
  });
}
