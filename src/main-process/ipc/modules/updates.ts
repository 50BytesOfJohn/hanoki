import { IPC_CHANNELS } from "@shared/ipc";
import type { UpdateStateSnapshot } from "@shared/events";
import { checkForUpdates, installUpdate, openReleasesPage } from "../../app/updater";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

function expectNoArgs(args: unknown[]): [] {
  if (args.length !== 0) {
    throw AppError.badRequest(`Invalid IPC argument count. Expected 0, received ${args.length}.`);
  }
  return [];
}

export function registerUpdatesIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[], UpdateStateSnapshot>(context, registeredChannels, {
    channel: IPC_CHANNELS.updates.check,
    parseArgs: expectNoArgs,
    handler: () => checkForUpdates(),
  });

  registerInvokeHandler<[], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.updates.install,
    parseArgs: expectNoArgs,
    handler: () => installUpdate(),
  });

  registerInvokeHandler<[], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.updates.openReleases,
    parseArgs: expectNoArgs,
    handler: () => openReleasesPage(),
  });
}
