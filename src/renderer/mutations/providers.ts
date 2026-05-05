import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProviderInfo } from "@shared/ipc";
import { providerApi } from "../api/providers";
import { queryKeys } from "../queries/keys";

export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (providerId: string) => providerApi.delete(providerId),
    onMutate: async (providerId) => {
      const listQueryKey = queryKeys.providers.list();
      const modelsQueryKey = queryKeys.providers.models(providerId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: listQueryKey, exact: true }),
        queryClient.cancelQueries({ queryKey: modelsQueryKey, exact: true }),
      ]);

      const previousProviders = queryClient.getQueryData<ProviderInfo[]>(listQueryKey);
      if (previousProviders) {
        queryClient.setQueryData<ProviderInfo[]>(
          listQueryKey,
          previousProviders.filter((provider) => provider.id !== providerId),
        );
      }

      queryClient.removeQueries({ queryKey: modelsQueryKey, exact: true });
      queryClient.removeQueries({ queryKey: queryKeys.providers.detail(providerId), exact: true });

      return {
        listQueryKey,
        previousProviders,
      };
    },
    onError: (_error, _providerId, context) => {
      if (context?.previousProviders) {
        queryClient.setQueryData(context.listQueryKey, context.previousProviders);
      }
    },
    onSettled: (_data, _error, providerId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providers.list(), exact: true });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.providers.models(providerId),
        exact: true,
      });
    },
  });
}
