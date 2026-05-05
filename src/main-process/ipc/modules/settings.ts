import {
  IPC_CHANNELS,
  type ChatFormSubmitBehavior,
  type GlobalChatSettings,
  type GlobalChatSettingsUpdateInput,
} from "@shared/ipc";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

const CHAT_FORM_SUBMIT_BEHAVIORS: readonly ChatFormSubmitBehavior[] = ["enter", "mod-enter"];

function expectArgCount(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(
      `Invalid IPC argument count. Expected ${min === max ? `${min}` : `${min}-${max}`}, received ${args.length}.`,
    );
  }
}

function parseFormSubmitBehavior(value: unknown): ChatFormSubmitBehavior {
  if (
    typeof value === "string" &&
    CHAT_FORM_SUBMIT_BEHAVIORS.includes(value as ChatFormSubmitBehavior)
  ) {
    return value as ChatFormSubmitBehavior;
  }

  throw AppError.badRequest(
    `formSubmitBehavior must be one of: ${CHAT_FORM_SUBMIT_BEHAVIORS.join(", ")}.`,
  );
}

function parseGlobalChatSettingsUpdateInput(args: unknown[]): [GlobalChatSettingsUpdateInput] {
  expectArgCount(args, 1);

  const rawInput = args[0];
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw AppError.badRequest("Global chat settings update payload must be an object.");
  }

  const inputRecord = rawInput as Record<string, unknown>;
  const allowedKeys = new Set(["promptStickyPosition", "formSubmitBehavior"]);
  for (const key of Object.keys(inputRecord)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported global chat settings update field "${key}".`);
    }
  }

  const parsedInput: GlobalChatSettingsUpdateInput = {};

  if (inputRecord.promptStickyPosition !== undefined) {
    if (typeof inputRecord.promptStickyPosition !== "boolean") {
      throw AppError.badRequest("promptStickyPosition must be a boolean.");
    }
    parsedInput.promptStickyPosition = inputRecord.promptStickyPosition;
  }

  if (inputRecord.formSubmitBehavior !== undefined) {
    parsedInput.formSubmitBehavior = parseFormSubmitBehavior(inputRecord.formSubmitBehavior);
  }

  return [parsedInput];
}

export function registerSettingsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[], GlobalChatSettings>(context, registeredChannels, {
    channel: IPC_CHANNELS.settings.getGlobalChat,
    parseArgs: (args) => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.settings.getGlobalChatSettings(),
  });

  registerInvokeHandler<[GlobalChatSettingsUpdateInput], GlobalChatSettings>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.settings.updateGlobalChat,
      parseArgs: parseGlobalChatSettingsUpdateInput,
      handler: ({ services }, _event, input) => services.settings.updateGlobalChatSettings(input),
    },
  );
}
