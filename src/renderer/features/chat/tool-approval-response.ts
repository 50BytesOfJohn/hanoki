import { TOOL_APPROVAL_EXPIRED_REASON, type ToolApprovalOutcome } from "@shared/ipc";

const USER_DENIED_LABEL = "You didn't allow this";

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
