import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MarkdownInfo } from "@shared/ipc";

import { markdownApi } from "../api/markdown";
import { toastManager } from "../components/ui/toast";
import { useWorkspaceStore } from "../features/workspace/store";
import { queryKeys } from "../queries/keys";

export function useCreateMarkdown() {
  const queryClient = useQueryClient();
  const openTab = useWorkspaceStore((state) => state.openTab);

  return useMutation({
    mutationFn: ({
      workspaceId,
      title,
      folderId,
    }: {
      workspaceId: string;
      title: string;
      folderId: string | null;
    }) => markdownApi.create(workspaceId, title, folderId),
    onSuccess: (item) => {
      queryClient.setQueryData(queryKeys.items.byId(item.id), item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      openTab({ type: "markdown", itemId: item.id });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Markdown item could not be created",
        description: error.message,
      });
    },
  });
}

export function useFlushMarkdownContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => markdownApi.flushContent(id),
    onSuccess: (item) => {
      queryClient.setQueryData<MarkdownInfo>(queryKeys.items.byId(item.id), item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
    },
  });
}
