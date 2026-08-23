import { parseChatId } from "@shared/chat/chat-id";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderId } from "@shared/folder/folder-id";
import { IPC_CHANNELS, type MarkdownInfo } from "@shared/ipc";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";
import { type } from "arktype";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

const MAX_MARKDOWN_LENGTH = 5 * 1024 * 1024;
const markdownContentSchema = type(`string <= ${MAX_MARKDOWN_LENGTH}`);
type UntrustedIpcValue = Parameters<typeof parseChatId>[0];

function parseMarkdownId(value: UntrustedIpcValue): string {
  const parsedId = parseChatId(value);
  if (!parsedId.ok) {
    throw AppError.badRequest(parsedId.error.replace("Chat", "Markdown item"));
  }
  return parsedId.value;
}

function parseMarkdownContent(value: UntrustedIpcValue): string {
  const parsedMarkdown = markdownContentSchema(value);
  if (parsedMarkdown instanceof type.errors) {
    throw AppError.badRequest("Markdown content must be a string no larger than 5 MiB.");
  }
  return parsedMarkdown;
}

function count(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(`Expected ${min}-${max} IPC arguments, received ${args.length}.`);
  }
}

export function registerMarkdownIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string, string, string | null], MarkdownInfo>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.markdown.create,
      parseArgs: (args) => {
        count(args, 2, 3);
        const parsedWorkspaceId = parseWorkspaceId(args[0]);
        if (!parsedWorkspaceId.ok) throw AppError.badRequest(parsedWorkspaceId.error);
        const parsedTitle = parseChatTitle(args[1]);
        if (!parsedTitle.ok) {
          throw AppError.badRequest(parsedTitle.error.replace("Chat", "Markdown item"));
        }
        let nextFolderId: string | null = null;
        if (args[2] !== undefined && args[2] !== null) {
          const parsedFolderId = parseFolderId(args[2]);
          if (!parsedFolderId.ok) throw AppError.badRequest(parsedFolderId.error);
          nextFolderId = parsedFolderId.value;
        }
        return [parsedWorkspaceId.value, parsedTitle.value, nextFolderId];
      },
      handler: ({ services }, _event, workspace, nextTitle, folder) =>
        services.chatTree.createMarkdown({
          workspaceId: workspace,
          title: nextTitle,
          folderId: folder,
        }),
    },
  );
  registerInvokeHandler<[string, string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.markdown.queueContent,
    parseArgs: (args) => {
      count(args, 2);
      return [parseMarkdownId(args[0]), parseMarkdownContent(args[1])];
    },
    handler: ({ services }, _event, itemId, markdown) =>
      services.chatTree.queueMarkdownContent(itemId, markdown),
  });
  registerInvokeHandler<[string], MarkdownInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.markdown.flushContent,
    parseArgs: (args) => {
      count(args, 1);
      return [parseMarkdownId(args[0])];
    },
    handler: ({ services }, _event, itemId) => services.chatTree.flushMarkdownContent(itemId),
  });
}
