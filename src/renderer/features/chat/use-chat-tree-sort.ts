import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChatTreeFolderPlacement, ChatTreeSortOrder, WorkspaceSettings } from "@shared/ipc";
import {
  DEFAULT_CHAT_TREE_FOLDER_PLACEMENT,
  DEFAULT_CHAT_TREE_SORT_ORDER,
} from "@shared/chat/chat-tree-sort";
import { workspaceApi } from "@/api/workspaces";
import { queryKeys } from "@/queries/keys";
import { workspaceSettingsQueryOptions } from "@/queries/workspaces";

type ChatTreeSortPatch = Pick<WorkspaceSettings, "chatTreeSortOrder" | "chatTreeFolderPlacement">;

/**
 * Per-workspace sort preferences for the sidebar folder tree, persisted in workspace settings.
 * Works for any workspace id, so the sidebar menu and the settings page share one source of truth.
 */
export function useChatTreeSort(workspaceId: string) {
  const queryClient = useQueryClient();
  const settingsQueryKey = queryKeys.workspaces.settings(workspaceId);

  const { data: settings, isPending } = useQuery({
    ...workspaceSettingsQueryOptions(workspaceId),
    enabled: workspaceId.length > 0,
  });

  const updateSort = useMutation({
    mutationFn: (patch: ChatTreeSortPatch) => workspaceApi.updateSettings(workspaceId, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKey, exact: true });
      const previousSettings = queryClient.getQueryData<WorkspaceSettings>(settingsQueryKey);
      queryClient.setQueryData<WorkspaceSettings>(settingsQueryKey, {
        ...previousSettings,
        ...patch,
      });
      return { previousSettings };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(settingsQueryKey, context?.previousSettings);
    },
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(settingsQueryKey, updatedSettings);
    },
  });

  return {
    sortOrder: settings?.chatTreeSortOrder ?? DEFAULT_CHAT_TREE_SORT_ORDER,
    folderPlacement: settings?.chatTreeFolderPlacement ?? DEFAULT_CHAT_TREE_FOLDER_PLACEMENT,
    isPending,
    setSortOrder: (sortOrder: ChatTreeSortOrder) =>
      updateSort.mutate({ chatTreeSortOrder: sortOrder }),
    setFolderPlacement: (folderPlacement: ChatTreeFolderPlacement) =>
      updateSort.mutate({ chatTreeFolderPlacement: folderPlacement }),
  };
}
