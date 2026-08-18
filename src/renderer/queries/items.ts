import { queryOptions } from "@tanstack/react-query";
import { itemsApi } from "../api/items";
import { queryKeys } from "./keys";

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
