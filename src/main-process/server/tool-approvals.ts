import { createHash } from "node:crypto";
import type { ModelMessage, ToolApprovalStatus } from "ai";

import { TOOL_APPROVAL_EXPIRED_REASON, type ToolApprovalOutcome } from "@shared/ipc";

/**
 * In-memory record of a tool call that is waiting on Allow once / Don't allow.
 * Lost on restart.
 */
export const TOOL_APPROVAL_TTL_MS = 10 * 60 * 1000;

const TOOL_UNAVAILABLE_REASON = "This tool is not available.";
const TOOL_MISMATCH_REASON = "The approval does not match this tool call.";
const TOOL_NOT_APPROVED_REASON = "This request is not approved.";
const TOOL_DENIED_REASON = "The user did not allow this action.";
const TOOL_CALL_ID_REASON = "Tool call is missing an id.";

export type ToolApprovalStatusName = "pending" | "approved" | "denied" | "executed" | "expired";

export interface ToolApprovalRecord {
  chatId: string;
  toolCallId: string;
  toolName: string;
  argsHash: string;
  createdAt: number;
  status: ToolApprovalStatusName;
}

type ServerToolApproval = (
  input: unknown,
  options: { toolCallId: string; messages: readonly ModelMessage[] },
) => ToolApprovalStatus;

type ToolWithExecute = {
  execute?: (
    input: unknown,
    options: { toolCallId: string; messages?: readonly ModelMessage[] },
  ) => unknown;
};

const records = new Map<string, ToolApprovalRecord>();

if (process.env.VITEST === "true") {
  Reflect.set(globalThis, "hanokiToolApprovalRecords", records);
}

function recordKey(chatId: string, toolCallId: string): string {
  return `${chatId}\0${toolCallId}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (Object.prototype.hasOwnProperty.call(value, "__proto__") && !keys.includes("__proto__")) {
      keys.push("__proto__");
    }
    const sorted: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.value === undefined) {
        continue;
      }
      sorted[key] = canonicalize(descriptor.value);
    }
    return sorted;
  }
  return value;
}

export function hashToolArgs(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

function deny(reason: string): ToolApprovalStatus {
  return { type: "denied", reason };
}

function expireIfNeeded(record: ToolApprovalRecord): boolean {
  if (Date.now() - record.createdAt < TOOL_APPROVAL_TTL_MS) {
    return false;
  }
  record.status = "expired";
  return true;
}

function dropIfExpired(key: string, record: ToolApprovalRecord): ToolApprovalRecord | undefined {
  if (!expireIfNeeded(record)) {
    return record;
  }
  records.delete(key);
  return undefined;
}

export function sweepExpiredToolApprovals(): void {
  for (const [key, record] of records) {
    dropIfExpired(key, record);
  }
}

function liveRecord(chatId: string, toolCallId: string): ToolApprovalRecord | undefined {
  const key = recordKey(chatId, toolCallId);
  const existing = records.get(key);
  if (!existing) return undefined;
  return dropIfExpired(key, existing);
}

export function recordPendingToolApproval(input: {
  chatId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}): void {
  sweepExpiredToolApprovals();
  const key = recordKey(input.chatId, input.toolCallId);
  const existing = records.get(key);
  const live = existing ? dropIfExpired(key, existing) : undefined;
  const argsHash = hashToolArgs(input.args);
  if (
    live &&
    live.status === "pending" &&
    live.chatId === input.chatId &&
    live.toolName === input.toolName &&
    live.argsHash === argsHash
  ) {
    return;
  }
  records.set(key, {
    chatId: input.chatId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    argsHash,
    createdAt: Date.now(),
    status: "pending",
  });
}

export function decideToolApproval(input: {
  chatId: string;
  toolCallId: string;
  approved: boolean;
}): ToolApprovalOutcome {
  sweepExpiredToolApprovals();
  const record = liveRecord(input.chatId, input.toolCallId);
  if (!input.approved) {
    if (
      record &&
      record.chatId === input.chatId &&
      (record.status === "pending" || record.status === "approved")
    ) {
      record.status = "denied";
    }
    return "denied";
  }
  if (record?.status === "approved") return "approved";
  if (record?.status === "pending") {
    record.status = "approved";
    return "approved";
  }
  return "expired";
}

/**
 * Single-use check. The status write happens before the tool body runs, so a
 * second caller in the same turn sees `executed`.
 */
export function consumeApprovedToolExecution(input: {
  chatId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}): boolean {
  sweepExpiredToolApprovals();
  const record = liveRecord(input.chatId, input.toolCallId);
  if (
    !record ||
    record.status !== "approved" ||
    record.chatId !== input.chatId ||
    record.toolCallId !== input.toolCallId ||
    record.toolName !== input.toolName ||
    record.argsHash !== hashToolArgs(input.args)
  ) {
    return false;
  }
  record.status = "executed";
  return true;
}

export function deleteToolApprovalsForChats(chatIds: readonly string[]): void {
  if (chatIds.length === 0) {
    return;
  }
  const drop = new Set(chatIds);
  for (const [key, record] of records) {
    if (drop.has(record.chatId)) {
      records.delete(key);
    }
  }
}

function clientClaimsApproved(messages: readonly ModelMessage[], toolCallId: string): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "tool" || typeof last.content === "string") {
    return false;
  }
  const approvalIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool-approval-request" && part.toolCallId === toolCallId) {
        approvalIds.add(part.approvalId);
      }
    }
  }
  if (approvalIds.size === 0) {
    return false;
  }
  for (const part of last.content) {
    if (part.type === "tool-result" && part.toolCallId === toolCallId) {
      return false;
    }
  }
  for (const part of last.content) {
    if (
      part.type === "tool-approval-response" &&
      part.approved === true &&
      approvalIds.has(part.approvalId)
    ) {
      return true;
    }
  }
  return false;
}

function claimedApprovalStatus(
  record: ToolApprovalRecord | undefined,
  toolName: string,
  args: unknown,
): ToolApprovalStatus {
  if (!record) return deny(TOOL_APPROVAL_EXPIRED_REASON);
  if (record.toolName !== toolName || record.argsHash !== hashToolArgs(args)) {
    return deny(TOOL_MISMATCH_REASON);
  }
  if (record.status === "approved") return "user-approval";
  if (record.status === "pending") return deny(TOOL_NOT_APPROVED_REASON);
  if (record.status === "denied") return deny(TOOL_DENIED_REASON);
  return deny(TOOL_APPROVAL_EXPIRED_REASON);
}

function guardToolExecution<T>(
  toolName: string,
  chatId: string,
  base: T,
  requiresApproval: (input: unknown) => boolean,
  enabled: boolean,
): T {
  const candidate = base as T & ToolWithExecute;
  if (typeof candidate.execute !== "function") {
    return base;
  }
  const execute = candidate.execute;
  return {
    ...candidate,
    execute: (
      input: unknown,
      options: { toolCallId: string; messages?: readonly ModelMessage[] },
    ) => {
      const claimed = clientClaimsApproved(options.messages ?? [], options.toolCallId);
      if (
        !enabled ||
        ((claimed || requiresApproval(input)) &&
          !consumeApprovedToolExecution({
            chatId,
            toolCallId: options.toolCallId,
            toolName,
            args: input,
          }))
      ) {
        throw new Error("Tool execution was not approved.");
      }
      return execute(input, options);
    },
  };
}

function createServerToolApproval(options: {
  chatId: string;
  toolName: string;
  enabled: boolean;
  requiresApproval: (input: unknown) => boolean;
}): ServerToolApproval {
  return (input, exec) => {
    if (typeof exec.toolCallId !== "string" || exec.toolCallId.length === 0) {
      return deny(TOOL_CALL_ID_REASON);
    }
    sweepExpiredToolApprovals();
    const claimed = clientClaimsApproved(exec.messages ?? [], exec.toolCallId);
    if (claimed) {
      if (!options.enabled) return deny(TOOL_UNAVAILABLE_REASON);
      return claimedApprovalStatus(
        liveRecord(options.chatId, exec.toolCallId),
        options.toolName,
        input,
      );
    }
    if (!options.enabled) return deny(TOOL_UNAVAILABLE_REASON);
    if (!options.requiresApproval(input)) return undefined;
    recordPendingToolApproval({
      chatId: options.chatId,
      toolCallId: exec.toolCallId,
      toolName: options.toolName,
      args: input,
    });
    return "user-approval";
  };
}

export function applyServerToolApprovals<Tools extends Record<string, unknown>>(
  tools: Tools,
  chatId: string,
  policies: { [Name in keyof Tools]?: (input: unknown) => boolean },
  enabledTools?: readonly string[],
): {
  tools: Tools;
  toolApproval: { [Name in keyof Tools]?: ServerToolApproval };
} {
  const gated = { ...tools };
  const toolApproval: { [Name in keyof Tools]?: ServerToolApproval } = {};
  for (const name of Object.keys(tools)) {
    const policy = policies[name as keyof Tools] ?? (() => false);
    const enabled = enabledTools === undefined || enabledTools.includes(name);
    gated[name as keyof Tools] = guardToolExecution(
      name,
      chatId,
      tools[name],
      policy,
      enabled,
    ) as Tools[keyof Tools];
    toolApproval[name as keyof Tools] = createServerToolApproval({
      chatId,
      toolName: name,
      enabled,
      requiresApproval: policy,
    });
  }
  return { tools: gated, toolApproval };
}
