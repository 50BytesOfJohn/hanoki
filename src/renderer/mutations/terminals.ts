import { useMutation, useQueryClient } from "@tanstack/react-query";
import { terminalsApi } from "../api/terminals";
import { queryKeys } from "../queries/keys";

export function useCreateTerminal() {
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
    }) => terminalsApi.create(workspaceId, title, folderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
  });
}
