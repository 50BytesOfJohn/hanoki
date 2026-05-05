import { queryOptions } from "@tanstack/react-query";
import { chatTreeApi } from "../api/chat-tree";
import { queryKeys } from "./keys";

export function getChatTreeUiStateQueryOptions(
  workspaceId: string | null,
  options?: { enabled?: boolean },
) {
  return queryOptions({
    queryKey: queryKeys.chatTree.uiState(workspaceId ?? ""),
    queryFn: () => {
      if (!workspaceId) {
        throw new Error("Workspace ID is required.");
      }

      return chatTreeApi.getUiState(workspaceId);
    },
    enabled: options?.enabled ?? Boolean(workspaceId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
