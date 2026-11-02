import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { isItemType, type ChatTreeItemRef, type ItemInfo } from "@shared/ipc";

import { chatTreeApi } from "../api/chat-tree";
import { itemsApi } from "../api/items";
import { foldersApi } from "../api/folders";
import { toastManager } from "../components/ui/toast";
import { applyItemTitleUpdate } from "../features/items/item-title-events";
import { flushOpenMarkdownEditors } from "../features/markdown/markdown-session";
import {
  flushPendingWorkflowSaves,
  forgetWorkflows,
} from "../features/workflow/workflow-graph-store";
import { queryKeys } from "../queries/keys";
import { useWorkspaceStore } from "../features/workspace/store";

function isItemInfo(value: unknown): value is ItemInfo {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return isItemType(value.type);
}

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
      await flushOpenMarkdownEditors();
      return itemsApi.updateTitle(itemId.slice("item:".length), name);
    },
    onSuccess: (result) => {
      if (isItemInfo(result)) {
        applyItemTitleUpdate({
          type: "item:title-updated",
          itemId: result.id,
          itemType: result.type,
          workspaceId: result.workspaceId,
          title: result.title,
        });
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Rename failed",
        description: error instanceof Error ? error.message : "The name could not be saved.",
      });
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
        items: [{ kind: "item", id }],
      }),
  });
}

export function useDeleteChatTreeItems() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const removeTabsByItemIds = useWorkspaceStore((s) => s.removeTabsByItemIds);
  const removeExpandedNodes = useWorkspaceStore((s) => s.removeExpandedNodes);

  return useMutation({
    mutationFn: async ({
      workspaceId,
      items,
    }: {
      workspaceId: string;
      items: ChatTreeItemRef[];
    }) => {
      // A workflow save still waiting would land after the delete and fail.
      await flushPendingWorkflowSaves();
      return chatTreeApi.deleteItems(workspaceId, items);
    },
    onSuccess: (result) => {
      const currentChatId = useWorkspaceStore.getState().currentChatId;
      const deletedCurrentChat =
        currentChatId !== null && result.deletedItemIds.includes(currentChatId);

      // Before the tabs close: an editor flushes its pending save as it unmounts.
      forgetWorkflows(result.deletedItemIds);
      removeTabsByItemIds(result.deletedItemIds);
      removeExpandedNodes(result.deletedFolderIds);

      if (deletedCurrentChat) {
        void navigate({ to: "/chat" });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
    },
  });
}

export function useMoveFolder() {
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      foldersApi.move(id, parentId),
  });
}

export function useMoveItem() {
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      itemsApi.move(id, folderId),
  });
}
