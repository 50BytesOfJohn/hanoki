import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ChatInfo, ChatSettingsUpdateInput } from "@shared/ipc";

import { chatsApi } from "../api/chats";
import { useWorkspaceStore } from "../features/workspace/store";
import { queryKeys } from "../queries/keys";

export function useCreateChat() {
  const navigate = useNavigate();
  const setCurrentChat = useWorkspaceStore((state) => state.setCurrentChat);

  return useMutation({
    mutationFn: ({
      workspaceId,
      title,
      folderId,
    }: {
      workspaceId: string;
      title: string;
      folderId?: string | null;
    }) => chatsApi.create(workspaceId, title, folderId),
    onSuccess: (chat) => {
      setCurrentChat(chat.id);
      void navigate({ to: "/chat" });
    },
  });
}

export function useCloneChat() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => chatsApi.clone(id),
  });
}

export function useUpdateChatTitle() {
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => chatsApi.updateTitle(id, title),
  });
}

export function useMoveChat() {
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      chatsApi.move(id, folderId),
  });
}

export function useUpdateChatSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChatSettingsUpdateInput }) =>
      chatsApi.updateSettings(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.chats.byId(id), exact: true });

      const previous = queryClient.getQueryData<ChatInfo>(queryKeys.chats.byId(id));
      if (previous) {
        queryClient.setQueryData<ChatInfo>(queryKeys.chats.byId(id), {
          ...previous,
          settings: {
            ...previous.settings,
            ...input,
          },
        });
      }

      return { previous, id };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.chats.byId(context.id), context.previous);
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.chats.byId(next.id), next);
    },
    onSettled: (_data, _error, variables) => {
      if (!variables) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: queryKeys.chats.byId(variables.id),
        exact: true,
      });
    },
  });
}

export function useDeleteChat() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => chatsApi.delete(id),
  });
}
