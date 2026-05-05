import { queryOptions } from "@tanstack/react-query";
import type { WorkspaceInfo } from "@shared/ipc";
import { workspaceApi } from "../api/workspaces";
import { queryKeys } from "./keys";

export const listWorkspacesQueryOptions = queryOptions({
  queryKey: queryKeys.workspaces.list(),
  queryFn: () => workspaceApi.list(),
  staleTime: Number.POSITIVE_INFINITY,
});

export const activeWorkspaceQueryOptions = queryOptions({
  queryKey: queryKeys.workspaces.active(),
  queryFn: () => workspaceApi.getActive(),
  staleTime: Number.POSITIVE_INFINITY,
});

export function findWorkspaceById(
  workspaces: readonly WorkspaceInfo[] | undefined,
  workspaceId: string | null | undefined,
): WorkspaceInfo | null {
  if (!workspaces || !workspaceId) {
    return null;
  }

  return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}
