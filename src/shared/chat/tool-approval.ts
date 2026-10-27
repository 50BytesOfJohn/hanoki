/**
 * One approval policy for every tool, shared by the chat route (which decides)
 * and the renderer (which labels the prompt and the chat's allowances).
 *
 * "ask" pauses each call that can change something until the user answers;
 * "allow-all" runs every call in that chat straight away.
 */
export const TOOL_APPROVAL_MODES = ["ask", "allow-all"] as const;

export type ToolApprovalMode = (typeof TOOL_APPROVAL_MODES)[number];

/** What a call can reach: the Hanoki workspace, or the user's computer. */
export type ToolApprovalScope = "workspace" | "computer";

interface ApprovalToolEntry {
  scope: ToolApprovalScope;
  /** Completes "Allow … in this chat" and the tools menu's allowance list. */
  label: string;
}

/**
 * Tools that ask before they run. Reads and creates run freely: a new item is
 * easy to spot and remove. hanokiSendMessage only asks when it starts a reply
 * in another chat; the chat route checks that before consulting this table.
 */
export const APPROVAL_TOOLS = {
  hanokiMoveItems: { scope: "workspace", label: "moving items" },
  hanokiRenameItem: { scope: "workspace", label: "renaming items" },
  hanokiEditNote: { scope: "workspace", label: "editing notes" },
  hanokiDeleteItems: { scope: "workspace", label: "deleting items" },
  hanokiSendMessage: { scope: "workspace", label: "starting replies in other chats" },
  terminalRun: { scope: "computer", label: "running commands" },
  terminalReadFile: { scope: "computer", label: "reading files" },
  terminalWriteFile: { scope: "computer", label: "saving files" },
  hanokiTerminalRun: { scope: "computer", label: "running commands in Hanoki terminals" },
  hanokiTerminalWrite: { scope: "computer", label: "typing into Hanoki terminals" },
  hanokiTerminalInterrupt: { scope: "computer", label: "interrupting Hanoki terminals" },
} as const satisfies Record<string, ApprovalToolEntry>;

export type ApprovalToolName = keyof typeof APPROVAL_TOOLS;

/** What the legacy `terminalAutoApprove` flag covered. */
export const LEGACY_TERMINAL_APPROVAL_TOOLS: readonly ApprovalToolName[] = [
  "terminalRun",
  "terminalReadFile",
  "terminalWriteFile",
];

export function isApprovalToolName(name: unknown): name is ApprovalToolName {
  return typeof name === "string" && Object.hasOwn(APPROVAL_TOOLS, name);
}

export function isToolApprovalMode(value: unknown): value is ToolApprovalMode {
  return value === "ask" || value === "allow-all";
}

export interface ToolApprovalPolicy {
  mode?: ToolApprovalMode;
  allowedTools?: readonly string[];
  /** App-wide "Run without asking" for commands and files on this computer. */
  computerToolsAlwaysAllowed: boolean;
}

export type ToolApprovalDecision =
  | { type: "not-applicable" }
  | { type: "approved"; reason: string }
  | { type: "user-approval" };

export function decideToolApproval(
  toolName: string,
  policy: ToolApprovalPolicy,
): ToolApprovalDecision {
  if (!isApprovalToolName(toolName)) return { type: "not-applicable" };
  if (policy.mode === "allow-all") {
    return { type: "approved", reason: "All actions are allowed in this chat." };
  }
  if (policy.allowedTools?.includes(toolName)) {
    return { type: "approved", reason: `Allowed ${APPROVAL_TOOLS[toolName].label} in this chat.` };
  }
  if (APPROVAL_TOOLS[toolName].scope === "computer" && policy.computerToolsAlwaysAllowed) {
    return { type: "approved", reason: "Settings allow commands to run without asking." };
  }
  return { type: "user-approval" };
}

/** Deduped, known names only, in table order so stored lists compare cleanly. */
export function normalizeAllowedTools(value: readonly unknown[]): ApprovalToolName[] {
  return (Object.keys(APPROVAL_TOOLS) as ApprovalToolName[]).filter((name) => value.includes(name));
}
