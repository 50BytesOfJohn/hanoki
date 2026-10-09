import { IPC_CHANNELS } from "@shared/ipc";
import { externalUrlToOpen } from "@shared/external-url";
import { openExternalUrl } from "../../app/open-external";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

export function registerShellIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.shell.openExternal,
    parseArgs: (args) => {
      if (args.length !== 1 || typeof args[0] !== "string") {
        throw AppError.badRequest("Expected one link.");
      }
      const allowed = externalUrlToOpen(args[0]);
      if (!allowed) throw AppError.badRequest("This link cannot be opened.");
      return [allowed];
    },
    handler: (_context, _event, url) => openExternalUrl(url),
  });
}
