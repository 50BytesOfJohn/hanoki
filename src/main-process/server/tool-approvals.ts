import { createHash } from "node:crypto";

/**
 * In-memory record of a tool call that is waiting on Allow once / Don't allow.
 * ponytail: lost on restart. The in-flight turn is gone too; move to sqlite if a
 * restart must keep a pending Allow once.
 */
export const TOOL_APPROVAL_TTL_MS = 10 * 60 * 1000;

export type ToolApprovalStatus = "pending" | "approved" | "denied" | "executed" | "expired";

export interface ToolApprovalRecord {
  chatId: string;
  toolCallId: string;
  toolName: string;
  argsHash: string;
  createdAt: number;
  status: ToolApprovalStatus;
}

type ApprovalContentPart = {
  type: string;
  toolCallId?: string;
  approvalId?: string;
  approved?: boolean;
  toolCall?: { toolCallId?: string };
};

type ApprovalMessage = {
  role: string;
  content: string | readonly ApprovalContentPart[];
};

type ApprovalOptions = {
  toolCallId: string;
  messages: readonly ApprovalMessage[];
};

export type ServerToolApproval = (
  input: unknown,
  options: ApprovalOptions,
) => "user-approval" | "denied" | undefined;

type ToolWithExecute = {
  execute?: (input: unknown, options: { toolCallId: string }) => unknown;
};

const records = new Map<string, ToolApprovalRecord>();
let now = () => Date.now();
let ttlMs = TOOL_APPROVAL_TTL_MS;

function recordKey(chatId: string, toolCallId: string): string {
  return `${chatId}\0${toolCallId}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) {
        sorted[key] = canonicalize(source[key]);
      }
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

function expireIfNeeded(record: ToolApprovalRecord): boolean {
  if (record.status === "executed" || record.status === "expired") {
    return record.status === "expired";
  }
  if (now() - record.createdAt < ttlMs) {
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

export function recordPendingToolApproval(input: {
  chatId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}): void {
  sweepExpiredToolApprovals();
  const key = recordKey(input.chatId, input.toolCallId);
  const existing = records.get(key);
  if (existing) {
    dropIfExpired(key, existing);
    return;
  }
  records.set(key, {
    chatId: input.chatId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    argsHash: hashToolArgs(input.args),
    createdAt: now(),
    status: "pending",
  });
}

export function decideToolApproval(input: {
  chatId: string;
  toolCallId: string;
  approved: boolean;
}): boolean {
  sweepExpiredToolApprovals();
  const key = recordKey(input.chatId, input.toolCallId);
  const record = records.get(key);
  if (!record || record.status !== "pending") {
    return false;
  }
  if (!dropIfExpired(key, record)) {
    return false;
  }
  record.status = input.approved ? "approved" : "denied";
  return true;
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
  const key = recordKey(input.chatId, input.toolCallId);
  const record = records.get(key);
  if (!record || !dropIfExpired(key, record)) {
    return false;
  }
  if (
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

export function getToolApprovalForTests(
  chatId: string,
  toolCallId: string,
): ToolApprovalRecord | undefined {
  return records.get(recordKey(chatId, toolCallId));
}

export function resetToolApprovalsForTests(): void {
  records.clear();
  now = () => Date.now();
  ttlMs = TOOL_APPROVAL_TTL_MS;
}

export function setToolApprovalClockForTests(
  clock: () => number,
  ttl = TOOL_APPROVAL_TTL_MS,
): void {
  now = clock;
  ttlMs = ttl;
}

function approvalPartToolCallId(part: ApprovalContentPart): string | undefined {
  return part.toolCallId ?? part.toolCall?.toolCallId;
}

function clientClaimsApproved(messages: readonly ApprovalMessage[], toolCallId: string): boolean {
  const approvalIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool-approval-request" && approvalPartToolCallId(part) === toolCallId) {
        if (part.approvalId) approvalIds.add(part.approvalId);
      }
    }
  }
  if (approvalIds.size === 0) {
    return false;
  }
  for (const message of messages) {
    if (message.role !== "tool" || typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (
        part.type === "tool-approval-response" &&
        part.approved === true &&
        part.approvalId !== undefined &&
        approvalIds.has(part.approvalId)
      ) {
        return true;
      }
    }
  }
  return false;
}

function guardToolExecution<T>(
  toolName: string,
  chatId: string,
  base: T,
  requiresApproval: (input: unknown) => boolean,
): T {
  const candidate = base as T & ToolWithExecute;
  if (typeof candidate.execute !== "function") {
    return base;
  }
  const execute = candidate.execute;
  return {
    ...candidate,
    execute: (input: unknown, options: { toolCallId: string }) => {
      const key = recordKey(chatId, options.toolCallId);
      const existing = records.get(key);
      if (
        (existing !== undefined || requiresApproval(input)) &&
        !consumeApprovedToolExecution({
          chatId,
          toolCallId: options.toolCallId,
          toolName,
          args: input,
        })
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
  requiresApproval: (input: unknown) => boolean;
}): ServerToolApproval {
  return (input, exec) => {
    if (!options.requiresApproval(input)) {
      return undefined;
    }
    if (typeof exec.toolCallId !== "string" || exec.toolCallId.length === 0) {
      return "denied";
    }
    const key = recordKey(options.chatId, exec.toolCallId);
    const existing = records.get(key);
    const record = existing ? dropIfExpired(key, existing) : undefined;
    const claimed = clientClaimsApproved(exec.messages ?? [], exec.toolCallId);
    if (!record) {
      if (claimed) {
        return "denied";
      }
      recordPendingToolApproval({
        chatId: options.chatId,
        toolCallId: exec.toolCallId,
        toolName: options.toolName,
        args: input,
      });
      return "user-approval";
    }
    if (record.toolName !== options.toolName || record.argsHash !== hashToolArgs(input)) {
      return "denied";
    }
    if (record.status === "approved") {
      return "user-approval";
    }
    if (record.status === "pending" && !claimed) {
      return "user-approval";
    }
    return "denied";
  };
}

export function applyServerToolApprovals<Tools extends Record<string, unknown>>(
  tools: Tools,
  chatId: string,
  policies: Partial<Record<keyof Tools & string, (input: unknown) => boolean>>,
): {
  tools: Tools;
  toolApproval: Partial<Record<keyof Tools & string, ServerToolApproval>>;
} {
  const gated = { ...tools };
  const toolApproval: Partial<Record<keyof Tools & string, ServerToolApproval>> = {};
  for (const name of Object.keys(policies) as (keyof Tools & string)[]) {
    const policy = policies[name];
    if (!policy) continue;
    gated[name] = guardToolExecution(name, chatId, tools[name], policy) as Tools[typeof name];
    toolApproval[name] = createServerToolApproval({
      chatId,
      toolName: name,
      requiresApproval: policy,
    });
  }
  return { tools: gated, toolApproval };
}
