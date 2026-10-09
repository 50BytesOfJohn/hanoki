import type { ToolApprovalDecision } from "@shared/ipc";

export const toolApprovalsApi = {
  respond(input: ToolApprovalDecision) {
    return window.electronAPI.respondToToolApproval(input);
  },
};
