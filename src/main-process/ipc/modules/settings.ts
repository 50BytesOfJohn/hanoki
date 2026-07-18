import {
  IPC_CHANNELS,
  type ChatFormSubmitBehavior,
  type GlobalChatSettings,
  type GlobalChatSettingsUpdateInput,
  type SumiModelReference,
  type SumiSettings,
  type SumiSettingsUpdateInput,
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
  const allowedKeys = new Set(["promptStickyPosition", "formSubmitBehavior", "sidebarViewMode"]);
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

  if (inputRecord.sidebarViewMode !== undefined) {
    if (inputRecord.sidebarViewMode !== "tree" && inputRecord.sidebarViewMode !== "activity") {
      throw AppError.badRequest('sidebarViewMode must be "tree" or "activity".');
    }
    parsedInput.sidebarViewMode = inputRecord.sidebarViewMode;
  }

  return [parsedInput];
}

function parseSumiSettingsUpdateInput(args: unknown[]): [SumiSettingsUpdateInput] {
  expectArgCount(args, 1);

  const rawInput = expectRecord(args[0], "Sumi settings update payload");
  expectAllowedKeys(rawInput, ["promptActions", "titleGeneration"]);
  const parsedInput: SumiSettingsUpdateInput = {};

  if (rawInput.promptActions !== undefined) {
    const rawPromptActions = expectRecord(rawInput.promptActions, "promptActions settings update");
    expectAllowedKeys(rawPromptActions, ["enabled", "model"]);

    const promptActionsInput: NonNullable<SumiSettingsUpdateInput["promptActions"]> = {};

    if (rawPromptActions.enabled !== undefined) {
      if (typeof rawPromptActions.enabled !== "boolean") {
        throw AppError.badRequest("promptActions.enabled must be a boolean.");
      }
      promptActionsInput.enabled = rawPromptActions.enabled;
    }

    if (rawPromptActions.model !== undefined) {
      promptActionsInput.model = parseSumiModelReference(
        rawPromptActions.model,
        "promptActions.model",
      );
    }

    parsedInput.promptActions = promptActionsInput;
  }

  if (rawInput.titleGeneration !== undefined) {
    const rawTitleGeneration = expectRecord(
      rawInput.titleGeneration,
      "titleGeneration settings update",
    );
    expectAllowedKeys(rawTitleGeneration, ["enabled", "autoGenerate", "model"]);

    const titleGenerationInput: NonNullable<SumiSettingsUpdateInput["titleGeneration"]> = {};

    if (rawTitleGeneration.enabled !== undefined) {
      if (typeof rawTitleGeneration.enabled !== "boolean") {
        throw AppError.badRequest("titleGeneration.enabled must be a boolean.");
      }
      titleGenerationInput.enabled = rawTitleGeneration.enabled;
    }

    if (rawTitleGeneration.autoGenerate !== undefined) {
      if (typeof rawTitleGeneration.autoGenerate !== "boolean") {
        throw AppError.badRequest("titleGeneration.autoGenerate must be a boolean.");
      }
      titleGenerationInput.autoGenerate = rawTitleGeneration.autoGenerate;
    }

    if (rawTitleGeneration.model !== undefined) {
      titleGenerationInput.model = parseSumiModelReference(
        rawTitleGeneration.model,
        "titleGeneration.model",
      );
    }

    parsedInput.titleGeneration = titleGenerationInput;
  }

  return [parsedInput];
}

function parseSumiModelReference(value: unknown, label: string): SumiModelReference {
  const model = expectRecord(value, label);
  expectAllowedKeys(model, ["providerId", "providerModelId"]);

  if (typeof model.providerId !== "string" || model.providerId.trim().length === 0) {
    throw AppError.badRequest(`${label}.providerId must be a non-empty string.`);
  }
  if (typeof model.providerModelId !== "string" || model.providerModelId.trim().length === 0) {
    throw AppError.badRequest(`${label}.providerModelId must be a non-empty string.`);
  }

  return {
    providerId: model.providerId.trim(),
    providerModelId: model.providerModelId.trim(),
  };
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw AppError.badRequest(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectAllowedKeys(record: Record<string, unknown>, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw AppError.badRequest(`Unsupported settings update field "${key}".`);
    }
  }
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

  registerInvokeHandler<[], SumiSettings>(context, registeredChannels, {
    channel: IPC_CHANNELS.settings.getSumi,
    parseArgs: (args) => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.settings.getSumiSettings(),
  });

  registerInvokeHandler<[SumiSettingsUpdateInput], SumiSettings>(context, registeredChannels, {
    channel: IPC_CHANNELS.settings.updateSumi,
    parseArgs: parseSumiSettingsUpdateInput,
    handler: ({ services }, _event, input) => services.settings.updateSumiSettings(input),
  });
}
