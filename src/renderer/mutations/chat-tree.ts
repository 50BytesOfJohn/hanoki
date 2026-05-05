import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChatTreeItemRef } from "@shared/ipc";

import { chatTreeApi } from "../api/chat-tree";
import { chatsApi } from "../api/chats";
import { foldersApi } from "../api/folders";
import { queryKeys } from "../queries/keys";
import { useWorkspaceStore } from "../features/workspace/store";

export function useSetChatTreeUiState() {
  return useMutation({
    mutationFn: ({
      workspaceId,
      expandedFolderIds,
    }: {
      workspaceId: string;
      expandedFolderIds: string[];
    }) => chatTreeApi.setUiState(workspaceId, expandedFolderIds),
  });
}

export function useRenameChatTreeItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, name }: { itemId: string; name: string }) => {
      if (itemId.startsWith("folder:")) {
        return foldersApi.updateName(itemId.slice("folder:".length), name);
      }
      return chatsApi.updateTitle(itemId.slice("chat:".length), name);
    },
    onSuccess: (_result, variables) => {
      if (!variables.itemId.startsWith("chat:")) {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
    },
  });
}

export function useDeleteFolder() {
  const deleteItems = useDeleteChatTreeItems();

  return useMutation({
    mutationFn: async ({ workspaceId, id }: { workspaceId: string; id: string }) =>
      deleteItems.mutateAsync({
        workspaceId,
        items: [{ kind: "folder", id }],
      }),
  });
}

export function useDeleteChat() {
  const deleteItems = useDeleteChatTreeItems();

  return useMutation({
    mutationFn: async ({ workspaceId, id }: { workspaceId: string; id: string }) =>
      deleteItems.mutateAsync({
        workspaceId,
        items: [{ kind: "chat", id }],
      }),
  });
}

export function useDeleteChatTreeItems() {
  const queryClient = useQueryClient();
  const removeTabsByChatIds = useWorkspaceStore((s) => s.removeTabsByChatIds);
  const removeExpandedNodes = useWorkspaceStore((s) => s.removeExpandedNodes);

  return useMutation({
    mutationFn: ({ workspaceId, items }: { workspaceId: string; items: ChatTreeItemRef[] }) =>
      chatTreeApi.deleteItems(workspaceId, items),
    onSuccess: (result) => {
      removeTabsByChatIds(result.deletedChatIds);
      removeExpandedNodes(result.deletedFolderIds);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
    },
  });
}

export function useMoveFolder() {
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      foldersApi.move(id, parentId),
  });
}

export function useMoveChat() {
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      chatsApi.move(id, folderId),
  });
}
