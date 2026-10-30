import { queryOptions } from "@tanstack/react-query";
import type { ItemInfo } from "@shared/ipc";
import { itemsApi } from "../api/items";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "./keys";

/**
 * Primes the item caches from an item that was already fetched, so a tab, pane header or chat
 * opened from it renders its title straight away instead of a loading state. An existing entry
 * wins: it may hold an optimistic update that this copy predates.
 */
export function seedItemCache(item: ItemInfo): void {
  const itemKey = queryKeys.items.byId(item.id);
  if (!queryClient.getQueryData(itemKey)) queryClient.setQueryData(itemKey, item);
  if (item.type !== "chat") return;
  const chatKey = queryKeys.chats.byId(item.id);
  if (!queryClient.getQueryData(chatKey)) queryClient.setQueryData(chatKey, item);
}

export function getItemQueryOptions(itemId: string | null) {
  return queryOptions({
    queryKey: queryKeys.items.byId(itemId ?? ""),
    queryFn: () => {
      if (!itemId) throw new Error("Item ID is required.");
      return itemsApi.get(itemId);
    },
    enabled: Boolean(itemId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
