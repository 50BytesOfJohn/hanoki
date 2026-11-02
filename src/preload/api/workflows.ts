import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type WorkflowsApi = Pick<IpcApi, "createWorkflow" | "updateWorkflowGraph" | "listWorkflows">;

export function createWorkflowsApi(): WorkflowsApi {
  return {
    createWorkflow: (workspaceId, title, folderId) =>
      invokeIpc(IPC_CHANNELS.workflows.create, workspaceId, title, folderId),
    updateWorkflowGraph: (id, graph) => invokeIpc(IPC_CHANNELS.workflows.updateGraph, id, graph),
    listWorkflows: (workspaceId) => invokeIpc(IPC_CHANNELS.workflows.list, workspaceId),
  };
}
