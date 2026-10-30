import { useMutation, useQueryClient } from "@tanstack/react-query";
import { terminalsApi } from "../api/terminals";
import { seedItemCache } from "../queries/items";
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
    onSuccess: (terminal) => {
      seedItemCache(terminal);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
  });
}
