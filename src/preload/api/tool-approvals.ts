import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ToolApprovalsApi = Pick<IpcApi, "respondToToolApproval">;

export function createToolApprovalsApi(): ToolApprovalsApi {
  return {
    respondToToolApproval: (input) => invokeIpc(IPC_CHANNELS.toolApprovals.respond, input),
  };
}
