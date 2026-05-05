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
