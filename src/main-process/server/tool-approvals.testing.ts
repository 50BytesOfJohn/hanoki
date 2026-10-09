import type { ToolApprovalRecord } from "./tool-approvals";

function toolApprovalRecords(): Map<string, ToolApprovalRecord> {
  const value: unknown = Reflect.get(globalThis, "hanokiToolApprovalRecords");
  if (!(value instanceof Map)) {
    throw new Error("Tool approval records are not installed.");
  }
  return value;
}

export function getToolApprovalForTests(
  chatId: string,
  toolCallId: string,
): ToolApprovalRecord | undefined {
  return toolApprovalRecords().get(`${chatId}\0${toolCallId}`);
}

export function resetToolApprovalsForTests(): void {
  toolApprovalRecords().clear();
}
