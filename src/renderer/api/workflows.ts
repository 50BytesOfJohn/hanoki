import "../lib/electron-api";
import type { WorkflowGraph } from "@shared/workflow/graph";

export const workflowsApi = {
  create: (workspaceId: string, title: string, folderId?: string | null) =>
    window.electronAPI.createWorkflow(workspaceId, title, folderId),
  updateGraph: (id: string, graph: WorkflowGraph) =>
    window.electronAPI.updateWorkflowGraph(id, graph),
  list: (workspaceId: string) => window.electronAPI.listWorkflows(workspaceId),
};
