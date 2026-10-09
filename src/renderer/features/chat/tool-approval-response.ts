import { TOOL_APPROVAL_EXPIRED_REASON, type ToolApprovalOutcome } from "@shared/ipc";

const USER_DENIED_LABEL = "You didn't allow this";

export const TOOL_APPROVAL_SAVE_ERROR = "Couldn't save that choice. Try again.";

const EXPIRED_ACTION_CLASS = "text-muted-foreground";
const SAVE_ERROR_CLASS = "text-xs text-destructive";

export function toolApprovalCardNotice(
  notice: string | null,
):
  | { kind: "expired"; text: string; className: typeof EXPIRED_ACTION_CLASS }
  | { kind: "save-error"; text: string; className: typeof SAVE_ERROR_CLASS }
  | { kind: "none" } {
  if (notice === TOOL_APPROVAL_EXPIRED_REASON) {
    return { kind: "expired", text: notice, className: EXPIRED_ACTION_CLASS };
  }
  if (notice === TOOL_APPROVAL_SAVE_ERROR) {
    return { kind: "save-error", text: notice, className: SAVE_ERROR_CLASS };
  }
  return { kind: "none" };
}

export function settleToolApprovalClick(
  approved: boolean,
  outcome: ToolApprovalOutcome,
  reason?: string,
): { approved: boolean; reason?: string; notice: string | null } {
  if (approved && outcome === "expired") {
    return {
      approved: false,
      reason: TOOL_APPROVAL_EXPIRED_REASON,
      notice: TOOL_APPROVAL_EXPIRED_REASON,
    };
  }
  return {
    approved,
    ...(reason ? { reason } : {}),
    notice: null,
  };
}

export function toolDenialLabel(reason: string | undefined): string {
  if (reason === TOOL_APPROVAL_EXPIRED_REASON) return TOOL_APPROVAL_EXPIRED_REASON;
  return USER_DENIED_LABEL;
}
