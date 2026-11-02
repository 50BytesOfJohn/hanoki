import { queryOptions } from "@tanstack/react-query";
import { workflowsApi } from "../api/workflows";
import { queryKeys } from "./keys";

/** The workspace's workflows for the chat's workflow picker. */
export function listWorkflowsQueryOptions(workspaceId: string | null) {
  return queryOptions({
    queryKey: queryKeys.workflows.list(workspaceId ?? ""),
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is required.");
      return workflowsApi.list(workspaceId);
    },
    enabled: Boolean(workspaceId),
  });
}
