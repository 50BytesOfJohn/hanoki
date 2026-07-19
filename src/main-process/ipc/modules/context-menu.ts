import { shell } from "electron";
import { IPC_CHANNELS, type ContextMenuCommand, type ContextMenuCommandInput } from "@shared/ipc";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

const CONTEXT_MENU_COMMANDS = new Set<ContextMenuCommand>([
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "paste-and-match-style",
  "delete",
  "select-all",
  "look-up",
  "search-web",
]);

function parseContextMenuCommandInput(args: unknown[]): [ContextMenuCommandInput] {
  if (args.length !== 1) {
    throw AppError.badRequest(`Invalid IPC argument count. Expected 1, received ${args.length}.`);
  }

  const rawInput = args[0];
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw AppError.badRequest("Context menu command payload must be an object.");
  }

  const input = rawInput as Record<string, unknown>;
  const allowedKeys = new Set(["command", "selectionText"]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported context menu command field "${key}".`);
    }
  }

  if (
    typeof input.command !== "string" ||
    !CONTEXT_MENU_COMMANDS.has(input.command as ContextMenuCommand)
  ) {
    throw AppError.badRequest("Unsupported context menu command.");
  }

  if (input.selectionText !== undefined && typeof input.selectionText !== "string") {
    throw AppError.badRequest("selectionText must be a string when provided.");
  }

  return [
    {
      command: input.command as ContextMenuCommand,
      selectionText: input.selectionText,
    },
  ];
}

export function registerContextMenuIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[ContextMenuCommandInput], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.contextMenu.execute,
    parseArgs: parseContextMenuCommandInput,
    handler: async (_handlerContext, event, input) => {
      switch (input.command) {
        case "undo":
          event.sender.undo();
          return;
        case "redo":
          event.sender.redo();
          return;
        case "cut":
          event.sender.cut();
          return;
        case "copy":
          event.sender.copy();
          return;
        case "paste":
          event.sender.paste();
          return;
        case "paste-and-match-style":
          event.sender.pasteAndMatchStyle();
          return;
        case "delete":
          event.sender.delete();
          return;
        case "select-all":
          event.sender.selectAll();
          return;
        case "look-up":
          if (process.platform === "darwin") {
            event.sender.showDefinitionForSelection();
          }
          return;
        case "search-web": {
          const selectionText = input.selectionText?.trim();
          if (selectionText) {
            await shell.openExternal(
              `https://www.google.com/search?q=${encodeURIComponent(selectionText)}`,
            );
          }
        }
      }
    },
  });
}
