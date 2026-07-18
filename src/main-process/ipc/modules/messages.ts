import { type HanokiUiMessage } from "@shared/chat/message-metadata";
import type { PinnedBranchSummary } from "@shared/chat/pinned-branch";
import { parseChatId } from "@shared/chat/chat-id";
import { IPC_CHANNELS, type DeleteMessageScope, type EditMessageBehavior } from "@shared/ipc";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";
import {
  createTiptapDocumentFromText,
  parseTiptapDocument,
  type TiptapDocument,
} from "@shared/tiptap/document";

function expectArgCount(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(
      `Invalid IPC argument count. Expected ${min === max ? `${min}` : `${min}-${max}`}, received ${args.length}.`,
    );
  }
}

function parseValidChatId(input: unknown): string {
  const parsed = parseChatId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseValidMessageId(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw AppError.badRequest("Message ID must be a non-empty string.");
  }

  return input;
}

function parseOptionalBranchId(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input !== "string") {
    throw AppError.badRequest("branchId must be a string.");
  }

  return input;
}

function parseValidBranchId(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    throw AppError.badRequest("branchId must be a non-empty string.");
  }

  return input;
}

function parseMessageContent(input: unknown): TiptapDocument {
  const document = typeof input === "string" ? createTiptapDocumentFromText(input) : input;
  const parsed = parseTiptapDocument(document);
  if (!parsed.ok || parsed.value.displayText.trim().length === 0) {
    throw AppError.badRequest(parsed.ok ? "Message content cannot be empty." : parsed.error);
  }
  return parsed.value.document;
}

function parseEditMessageBehavior(input: unknown): EditMessageBehavior {
  if (input === "branch" || input === "overwrite") {
    return input;
  }

  throw AppError.badRequest('behavior must be either "branch" or "overwrite".');
}

function parseDeleteMessageScope(input: unknown): DeleteMessageScope {
  if (input === "message" || input === "branch") {
    return input;
  }

  throw AppError.badRequest('scope must be either "message" or "branch".');
}

function parseBoolean(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") {
    throw AppError.badRequest(`${label} must be a boolean.`);
  }

  return input;
}

export function registerMessagesIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string, string | null], HanokiUiMessage[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.messages.listByChat,
    parseArgs: (args) => {
      expectArgCount(args, 1, 2);
      return [parseValidChatId(args[0]), parseOptionalBranchId(args[1])];
    },
    handler: ({ services }, _event, chatId, branchId) =>
      services.chatMessages.listChatMessages(chatId, branchId),
  });

  registerInvokeHandler<[string], HanokiUiMessage[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.messages.listAllByChat,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidChatId(args[0])];
    },
    handler: ({ services }, _event, chatId) => services.chatMessages.listAllChatMessages(chatId),
  });

  registerInvokeHandler<[string, string], HanokiUiMessage[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.messages.switchBranch,
    parseArgs: (args) => {
      expectArgCount(args, 2);
      return [parseValidChatId(args[0]), parseValidBranchId(args[1])];
    },
    handler: ({ services }, _event, chatId, branchId) =>
      services.chatMessages.switchChatBranch(chatId, branchId),
  });

  registerInvokeHandler(context, registeredChannels, {
    channel: IPC_CHANNELS.messages.edit,
    parseArgs: (args): [string, TiptapDocument, EditMessageBehavior] => {
      expectArgCount(args, 3);
      return [
        parseValidMessageId(args[0]),
        parseMessageContent(args[1]),
        parseEditMessageBehavior(args[2]),
      ];
    },
    handler: ({ services }, _event, messageId, text, behavior) =>
      services.chatMessages.editMessage(messageId, text, behavior),
  });

  registerInvokeHandler<[string, DeleteMessageScope], HanokiUiMessage[]>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.messages.delete,
      parseArgs: (args): [string, DeleteMessageScope] => {
        expectArgCount(args, 2);
        return [parseValidMessageId(args[0]), parseDeleteMessageScope(args[1])];
      },
      handler: ({ services }, _event, messageId, scope) =>
        services.chatMessages.deleteMessage(messageId, scope),
    },
  );

  registerInvokeHandler<[string, boolean], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.messages.setPinned,
    parseArgs: (args): [string, boolean] => {
      expectArgCount(args, 2);
      return [parseValidMessageId(args[0]), parseBoolean(args[1], "pinned")];
    },
    handler: ({ services }, _event, messageId, pinned) =>
      services.chatMessages.setMessagePinned(messageId, pinned),
  });

  registerInvokeHandler<[], PinnedBranchSummary[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.messages.listPinned,
    parseArgs: (args): [] => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.chatMessages.listPinnedBranches(),
  });
}
