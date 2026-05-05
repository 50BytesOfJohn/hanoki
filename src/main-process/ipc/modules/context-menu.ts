import { BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from "electron";
import {
  IPC_CHANNELS,
  type MessageContextMenuAction,
  type TextContextMenuInput,
} from "@shared/ipc";
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

function parseTextContextMenuInput(args: unknown[]): [TextContextMenuInput] {
  expectArgCount(args, 1);

  const rawInput = args[0];
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw AppError.badRequest("Text context menu payload must be an object.");
  }

  const inputRecord = rawInput as Record<string, unknown>;
  const allowedKeys = new Set(["isEditable", "hasSelection", "selectionText"]);
  for (const key of Object.keys(inputRecord)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported text context menu field "${key}".`);
    }
  }

  if (typeof inputRecord.isEditable !== "boolean") {
    throw AppError.badRequest("isEditable must be a boolean.");
  }

  if (typeof inputRecord.hasSelection !== "boolean") {
    throw AppError.badRequest("hasSelection must be a boolean.");
  }

  if (typeof inputRecord.selectionText !== "string") {
    throw AppError.badRequest("selectionText must be a string.");
  }

  return [
    {
      isEditable: inputRecord.isEditable,
      hasSelection: inputRecord.hasSelection,
      selectionText: inputRecord.selectionText,
    },
  ];
}

function normalizeMenuTemplate(
  template: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  const normalized: MenuItemConstructorOptions[] = [];

  for (const item of template) {
    if (
      item.type === "separator" &&
      (normalized.length === 0 || normalized.at(-1)?.type === "separator")
    ) {
      continue;
    }

    normalized.push(item);
  }

  while (normalized.at(-1)?.type === "separator") {
    normalized.pop();
  }

  return normalized;
}

function createTextContextMenuTemplate(
  input: TextContextMenuInput,
  options: {
    isMac: boolean;
    onLookUpSelection: () => void;
    onSearchSelection: () => void;
  },
): MenuItemConstructorOptions[] {
  const hasSelection = input.hasSelection && input.selectionText.trim().length > 0;
  const template: MenuItemConstructorOptions[] = [];

  if (input.isEditable) {
    template.push({ role: "undo" });
    template.push({ role: "redo" });
    template.push({ type: "separator" });
    template.push({ role: "cut" });
    template.push({ role: "copy" });
    template.push({ role: "paste" });

    if (options.isMac) {
      template.push({ role: "pasteAndMatchStyle" });
    }

    template.push({ role: "delete" });
    template.push({ type: "separator" });
    template.push({ role: "selectAll" });
  } else {
    template.push({ role: "copy", enabled: hasSelection });
  }

  if (hasSelection) {
    template.push({ type: "separator" });

    if (options.isMac) {
      template.push({
        label: "Look Up",
        click: options.onLookUpSelection,
      });
    }

    template.push({
      label: options.isMac ? "Search with Google" : "Search the Web",
      click: options.onSearchSelection,
    });
  }

  if (options.isMac) {
    template.push({ type: "separator" });
    template.push({ role: "startSpeaking", enabled: hasSelection });
    template.push({ role: "stopSpeaking" });
  }

  return normalizeMenuTemplate(template);
}

export function registerContextMenuIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[TextContextMenuInput], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.contextMenu.showText,
    parseArgs: parseTextContextMenuInput,
    handler: (_handlerContext, event, input) => {
      const isMac = process.platform === "darwin";
      const selectedText = input.selectionText.trim();
      const menu = Menu.buildFromTemplate(
        createTextContextMenuTemplate(input, {
          isMac,
          onLookUpSelection: () => {
            event.sender.showDefinitionForSelection();
          },
          onSearchSelection: () => {
            if (!selectedText) {
              return;
            }

            void shell.openExternal(
              `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`,
            );
          },
        }),
      );
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;

      menu.popup({
        window,
        frame: event.senderFrame ?? event.sender.mainFrame,
      });
    },
  });

  registerInvokeHandler<[TextContextMenuInput], MessageContextMenuAction>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.contextMenu.showMessage,
      parseArgs: parseTextContextMenuInput,
      handler: (_handlerContext, event, input) => {
        const isMac = process.platform === "darwin";
        const selectedText = input.selectionText.trim();

        return new Promise<MessageContextMenuAction>((resolve) => {
          let selectedAction: MessageContextMenuAction = null;

          const menu = Menu.buildFromTemplate(
            normalizeMenuTemplate([
              ...createTextContextMenuTemplate(input, {
                isMac,
                onLookUpSelection: () => {
                  event.sender.showDefinitionForSelection();
                },
                onSearchSelection: () => {
                  if (!selectedText) {
                    return;
                  }

                  void shell.openExternal(
                    `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`,
                  );
                },
              }),
              { type: "separator" },
              {
                label: "Show in Graph",
                click: () => {
                  selectedAction = "show-in-graph";
                },
              },
            ]),
          );
          const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;

          menu.popup({
            window,
            callback: () => resolve(selectedAction),
            frame: event.senderFrame ?? event.sender.mainFrame,
          });
        });
      },
    },
  );
}
