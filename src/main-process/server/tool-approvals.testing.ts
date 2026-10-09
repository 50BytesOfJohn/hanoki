import { bindToolApprovalRecords, type ToolApprovalRecord } from "./tool-approvals";

const records = new Map<string, ToolApprovalRecord>();
bindToolApprovalRecords(records);

export function getToolApprovalForTests(
  chatId: string,
  toolCallId: string,
): ToolApprovalRecord | undefined {
  return records.get(`${chatId}\0${toolCallId}`);
}

export function resetToolApprovalsForTests(): void {
  records.clear();
}
