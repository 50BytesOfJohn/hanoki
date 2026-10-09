import { parseChatId } from "@shared/chat/chat-id";
import { IPC_CHANNELS, type ToolApprovalDecision } from "@shared/ipc";
import { decideToolApproval } from "../../server/tool-approvals";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

const MAX_TOOL_CALL_ID_LENGTH = 512;

function expectArgCount(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(
      `Invalid IPC argument count. Expected ${min === max ? `${min}` : `${min}-${max}`}, received ${args.length}.`,
    );
  }
}

function parseDecision(args: unknown[]): [ToolApprovalDecision] {
  expectArgCount(args, 1);
  const raw = args[0];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw AppError.badRequest("Tool approval payload must be an object.");
  }
  const value = raw as Record<string, unknown>;
  const parsedChatId = parseChatId(value.chatId);
  if (!parsedChatId.ok) {
    throw AppError.badRequest(parsedChatId.error);
  }
  if (typeof value.toolCallId !== "string" || value.toolCallId.length === 0) {
    throw AppError.badRequest("toolCallId is required.");
  }
  if (value.toolCallId.length > MAX_TOOL_CALL_ID_LENGTH) {
    throw AppError.badRequest("toolCallId is too long.");
  }
  if (typeof value.approved !== "boolean") {
    throw AppError.badRequest("approved must be a boolean.");
  }
  return [{ chatId: parsedChatId.value, toolCallId: value.toolCallId, approved: value.approved }];
}

export function registerToolApprovalsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[ToolApprovalDecision], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.toolApprovals.respond,
    parseArgs: parseDecision,
    handler: (_context, _event, input) => {
      if (!decideToolApproval(input)) {
        throw AppError.badRequest("Tool approval is not pending.");
      }
    },
  });
}
