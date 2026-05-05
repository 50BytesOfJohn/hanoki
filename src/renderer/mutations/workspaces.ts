import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceInfo } from "@shared/ipc";

import { workspaceApi } from "../api/workspaces";
import { queryKeys } from "../queries/keys";

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => workspaceApi.create(name),
    onSuccess: (createdWorkspace) => {
      const previousList = queryClient.getQueryData<WorkspaceInfo[]>(queryKeys.workspaces.list());
      const nextList = previousList
        ? mergeWorkspaceIntoList(previousList, createdWorkspace)
        : [createdWorkspace];

      resetQueryCacheForWorkspaceSwitch(queryClient, createdWorkspace, nextList);

      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list(), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active(), exact: true });
    },
  });
}

export function useSetActiveWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => workspaceApi.setActive(id),
    onMutate: async (workspaceId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.workspaces.list(), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.workspaces.active(), exact: true }),
      ]);

      const previousList = queryClient.getQueryData<WorkspaceInfo[]>(queryKeys.workspaces.list());
      const previousActive = queryClient.getQueryData<WorkspaceInfo>(queryKeys.workspaces.active());
      const optimisticActive = previousList?.find((workspace) => workspace.id === workspaceId);

      if (optimisticActive) {
        queryClient.setQueryData(queryKeys.workspaces.active(), optimisticActive);
      }

      return { previousList, previousActive };
    },
    onError: (_error, _workspaceId, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.workspaces.list(), context.previousList);
      }

      if (context?.previousActive) {
        queryClient.setQueryData(queryKeys.workspaces.active(), context.previousActive);
      }
    },
    onSuccess: (activeWorkspace) => {
      const previousList = queryClient.getQueryData<WorkspaceInfo[]>(queryKeys.workspaces.list());
      resetQueryCacheForWorkspaceSwitch(queryClient, activeWorkspace, previousList);

      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active(), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list(), exact: true });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; color?: string | null }) =>
      workspaceApi.update(id, input),
    onMutate: async ({ id, ...input }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.workspaces.list(), exact: true }),
        queryClient.cancelQueries({ queryKey: queryKeys.workspaces.active(), exact: true }),
      ]);

      const previousList = queryClient.getQueryData<WorkspaceInfo[]>(queryKeys.workspaces.list());
      const previousActive = queryClient.getQueryData<WorkspaceInfo>(queryKeys.workspaces.active());

      if (previousList) {
        queryClient.setQueryData(
          queryKeys.workspaces.list(),
          previousList.map((workspace) =>
            workspace.id === id ? { ...workspace, ...input } : workspace,
          ),
        );
      }

      if (previousActive?.id === id) {
        queryClient.setQueryData(queryKeys.workspaces.active(), { ...previousActive, ...input });
      }

      return { previousList, previousActive };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(queryKeys.workspaces.list(), context.previousList);
      }

      if (context?.previousActive) {
        queryClient.setQueryData(queryKeys.workspaces.active(), context.previousActive);
      }
    },
    onSuccess: (updatedWorkspace) => {
      const previousList = queryClient.getQueryData<WorkspaceInfo[]>(queryKeys.workspaces.list());
      if (previousList) {
        queryClient.setQueryData(
          queryKeys.workspaces.list(),
          mergeWorkspaceIntoList(previousList, updatedWorkspace),
        );
      }

      const previousActive = queryClient.getQueryData<WorkspaceInfo>(queryKeys.workspaces.active());
      if (previousActive?.id === updatedWorkspace.id) {
        queryClient.setQueryData(queryKeys.workspaces.active(), updatedWorkspace);
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.list(), exact: true });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active(), exact: true });
    },
  });
}

function mergeWorkspaceIntoList(
  workspaces: readonly WorkspaceInfo[],
  nextWorkspace: WorkspaceInfo,
): WorkspaceInfo[] {
  const existingIndex = workspaces.findIndex((workspace) => workspace.id === nextWorkspace.id);
  if (existingIndex === -1) {
    return [...workspaces, nextWorkspace];
  }

  return workspaces.map((workspace) =>
    workspace.id === nextWorkspace.id ? nextWorkspace : workspace,
  );
}

function resetQueryCacheForWorkspaceSwitch(
  queryClient: ReturnType<typeof useQueryClient>,
  activeWorkspace: WorkspaceInfo,
  workspaces: readonly WorkspaceInfo[] | undefined,
): void {
  queryClient.clear();

  if (workspaces) {
    queryClient.setQueryData(queryKeys.workspaces.list(), [...workspaces]);
  }

  queryClient.setQueryData(queryKeys.workspaces.active(), activeWorkspace);
}
