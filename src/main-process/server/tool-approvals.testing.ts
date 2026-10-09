import type { ToolApprovalRecord } from "./tool-approvals";
import { toolApprovalRecords } from "./tool-approval-records";

export function getToolApprovalForTests(
  chatId: string,
  toolCallId: string,
): ToolApprovalRecord | undefined {
  return toolApprovalRecords.get(`${chatId}\0${toolCallId}`);
}

export function resetToolApprovalsForTests(): void {
  toolApprovalRecords.clear();
}
