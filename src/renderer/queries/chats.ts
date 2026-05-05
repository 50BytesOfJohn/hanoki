import { queryOptions } from "@tanstack/react-query";

import { chatsApi } from "../api/chats";
import { messagesApi } from "../api/messages";
import { queryKeys } from "./keys";

export const CURRENT_BRANCH_QUERY_KEY = "__current__";

export function getChatQueryOptions(chatId: string | null, options?: { enabled?: boolean }) {
  return queryOptions({
    queryKey: queryKeys.chats.byId(chatId ?? ""),
    queryFn: () => {
      if (!chatId) {
        throw new Error("Chat ID is required.");
      }

      return chatsApi.get(chatId);
    },
    enabled: options?.enabled ?? Boolean(chatId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function getChatMessagesQueryOptions(
  chatId: string | null,
  branchId?: string | null,
  options?: { enabled?: boolean },
) {
  return queryOptions({
    queryKey: queryKeys.chats.messages(chatId ?? "", branchId ?? CURRENT_BRANCH_QUERY_KEY),
    queryFn: () => {
      if (!chatId) {
        throw new Error("Chat ID is required.");
      }

      return messagesApi.listMessages(chatId, branchId);
    },
    enabled: options?.enabled ?? Boolean(chatId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function getAllChatMessagesQueryOptions(
  chatId: string | null,
  options?: { enabled?: boolean },
) {
  return queryOptions({
    queryKey: queryKeys.chats.allMessages(chatId ?? ""),
    queryFn: () => {
      if (!chatId) {
        throw new Error("Chat ID is required.");
      }

      return messagesApi.listAllMessages(chatId);
    },
    enabled: options?.enabled ?? Boolean(chatId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function getPinnedBranchesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.chats.pinnedBranches(),
    queryFn: () => messagesApi.listPinnedBranches(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
