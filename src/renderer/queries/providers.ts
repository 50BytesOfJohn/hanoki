import { queryOptions } from "@tanstack/react-query";
import { providerApi } from "@/api/providers";
import { queryKeys } from "./keys";

export const listProvidersQueryOptions = queryOptions({
  queryKey: queryKeys.providers.list(),
  queryFn: () => providerApi.list(),
  staleTime: Number.POSITIVE_INFINITY,
});

export function listProviderModelsQueryOptions(providerId: string) {
  return queryOptions({
    queryKey: queryKeys.providers.models(providerId),
    queryFn: () => providerApi.listModels(providerId),
  });
}

export function providerBalanceQueryOptions(providerId: string) {
  return queryOptions({
    queryKey: queryKeys.providers.balance(providerId),
    queryFn: () => providerApi.getBalance(providerId),
    // Spending moves it, so refresh whenever the page is looked at again.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
