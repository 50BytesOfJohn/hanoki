import { IPC_CHANNELS, type ChatInfo, type ChatSettingsUpdateInput } from "@shared/ipc";
import { parseChatId } from "@shared/chat/chat-id";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderId } from "@shared/folder/folder-id";
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

function parseValidChatId(input: unknown): string {
  const parsed = parseChatId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseNullableFolderId(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const parsed = parseFolderId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseValidChatTitle(input: unknown): string {
  const parsed = parseChatTitle(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseChatSettingsUpdateInput(args: unknown[]): [string, ChatSettingsUpdateInput] {
  expectArgCount(args, 2);

  const chatId = parseValidChatId(args[0]);
  const rawInput = args[1];

  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw AppError.badRequest("Chat settings update payload must be an object.");
  }

  const inputRecord = rawInput as Record<string, unknown>;
  const allowedKeys = new Set([
    "modelId",
    "systemPrompt",
    "modelConfig",
    "webEnabled",
    "hanokiEnabled",
  ]);
  for (const key of Object.keys(inputRecord)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported chat settings update field "${key}".`);
    }
  }

  const parsedInput: ChatSettingsUpdateInput = {};

  if (inputRecord.modelId !== undefined) {
    if (inputRecord.modelId !== null && typeof inputRecord.modelId !== "string") {
      throw AppError.badRequest("modelId must be a string or null.");
    }

    parsedInput.modelId = inputRecord.modelId;
  }

  if (inputRecord.systemPrompt !== undefined) {
    if (inputRecord.systemPrompt !== null && typeof inputRecord.systemPrompt !== "string") {
      throw AppError.badRequest("systemPrompt must be a string or null.");
    }

    parsedInput.systemPrompt =
      typeof inputRecord.systemPrompt === "string" && inputRecord.systemPrompt.trim().length === 0
        ? null
        : inputRecord.systemPrompt;
  }

  if (inputRecord.modelConfig !== undefined) {
    if (
      !inputRecord.modelConfig ||
      typeof inputRecord.modelConfig !== "object" ||
      Array.isArray(inputRecord.modelConfig)
    ) {
      throw AppError.badRequest("modelConfig must be an object.");
    }

    const modelConfig = inputRecord.modelConfig as Record<string, unknown>;
    for (const key of Object.keys(modelConfig)) {
      if (key !== "temperature") {
        throw AppError.badRequest(`Unsupported model config update field "${key}".`);
      }
    }

    if (modelConfig.temperature !== undefined) {
      if (
        modelConfig.temperature !== null &&
        (typeof modelConfig.temperature !== "number" ||
          !Number.isFinite(modelConfig.temperature) ||
          modelConfig.temperature < 0 ||
          modelConfig.temperature > 1)
      ) {
        throw AppError.badRequest("temperature must be null or a number between 0 and 1.");
      }

      parsedInput.modelConfig = { temperature: modelConfig.temperature };
    }
  }

  if (inputRecord.webEnabled !== undefined) {
    if (typeof inputRecord.webEnabled !== "boolean") {
      throw AppError.badRequest("webEnabled must be a boolean.");
    }

    parsedInput.webEnabled = inputRecord.webEnabled;
  }

  if (inputRecord.hanokiEnabled !== undefined) {
    if (typeof inputRecord.hanokiEnabled !== "boolean") {
      throw AppError.badRequest("hanokiEnabled must be a boolean.");
    }

    parsedInput.hanokiEnabled = inputRecord.hanokiEnabled;
  }

  return [chatId, parsedInput];
}

export function registerChatsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string], ChatInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.get,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidChatId(args[0])];
    },
    handler: ({ services }, _event, id) => services.chatTree.getChat(id),
  });

  registerInvokeHandler<[string, string, string | null], ChatInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.create,
    parseArgs: (args) => {
      expectArgCount(args, 2, 3);
      return [
        parseValidWorkspaceId(args[0]),
        parseValidChatTitle(args[1]),
        parseNullableFolderId(args[2]),
      ];
    },
    handler: ({ services }, _event, workspaceId, title, folderId) =>
      services.chatTree.createChat({ workspaceId, title, folderId }),
  });

  registerInvokeHandler<[string], ChatInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.clone,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidChatId(args[0])];
    },
    handler: ({ services }, _event, chatId) => services.chatTree.cloneChat(chatId),
  });

  registerInvokeHandler<[string, string], ChatInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.updateTitle,
    parseArgs: (args) => {
      expectArgCount(args, 2);
      return [parseValidChatId(args[0]), parseValidChatTitle(args[1])];
    },
    handler: ({ services }, _event, id, title) => services.chatTree.updateChatTitle(id, title),
  });

  registerInvokeHandler<[string, ChatSettingsUpdateInput], ChatInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.updateSettings,
    parseArgs: parseChatSettingsUpdateInput,
    handler: ({ services }, _event, id, input) => services.chatTree.updateChatSettings(id, input),
  });

  registerInvokeHandler<[string, string | null], ChatInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.move,
    parseArgs: (args) => {
      expectArgCount(args, 2);
      return [parseValidChatId(args[0]), parseNullableFolderId(args[1])];
    },
    handler: ({ services }, _event, id, folderId) => services.chatTree.moveChat(id, folderId),
  });

  registerInvokeHandler<[string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.chats.delete,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidChatId(args[0])];
    },
    handler: ({ services }, _event, id) => services.chatTree.deleteChat(id),
  });
}
