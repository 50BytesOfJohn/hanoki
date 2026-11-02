import { useMutation, useQueryClient } from "@tanstack/react-query";

import { workflowsApi } from "../api/workflows";
import { toastManager } from "../components/ui/toast";
import { seedItemCache } from "../queries/items";
import { queryKeys } from "../queries/keys";

/** Creates a workflow; where it opens (a tab, a split beside a chat) is the caller's choice. */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      title,
      folderId,
    }: {
      workspaceId: string;
      title: string;
      folderId: string | null;
    }) => workflowsApi.create(workspaceId, title, folderId),
    onSuccess: (workflow) => {
      seedItemCache(workflow);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Workflow could not be created",
        description: error.message,
      });
    },
  });
}
