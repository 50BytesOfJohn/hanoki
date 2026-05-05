import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProviderModelInfo } from "@shared/ipc";
import { modelsApi } from "../api/models";
import { queryKeys } from "../queries/keys";

export function useUpdateProviderModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      modelId,
      input,
    }: {
      providerId: string;
      modelId: string;
      input: { isEnabled?: boolean; displayName?: string | null };
    }) => modelsApi.update(modelId, input),
    onMutate: async ({ providerId, modelId, input }) => {
      const queryKey = queryKeys.providers.models(providerId);
      await queryClient.cancelQueries({ queryKey, exact: true });

      const previousModels = queryClient.getQueryData<ProviderModelInfo[]>(queryKey);
      if (previousModels) {
        queryClient.setQueryData<ProviderModelInfo[]>(
          queryKey,
          previousModels.map((model) =>
            model.id === modelId
              ? {
                  ...model,
                  ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
                  ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
                }
              : model,
          ),
        );
      }

      return { previousModels, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousModels) {
        queryClient.setQueryData(context.queryKey, context.previousModels);
      }
    },
    onSuccess: (updatedModel, variables) => {
      const queryKey = queryKeys.providers.models(variables.providerId);
      const previousModels = queryClient.getQueryData<ProviderModelInfo[]>(queryKey);
      if (!previousModels) {
        return;
      }

      queryClient.setQueryData<ProviderModelInfo[]>(
        queryKey,
        previousModels.map((model) => (model.id === updatedModel.id ? updatedModel : model)),
      );
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.providers.models(variables.providerId),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.models.enabled(),
        exact: true,
      });
    },
  });
}

export function useSetProviderModelsEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ providerId, isEnabled }: { providerId: string; isEnabled: boolean }) =>
      modelsApi.setProviderEnabled(providerId, isEnabled),
    onMutate: async ({ providerId, isEnabled }) => {
      const queryKey = queryKeys.providers.models(providerId);
      await queryClient.cancelQueries({ queryKey, exact: true });

      const previousModels = queryClient.getQueryData<ProviderModelInfo[]>(queryKey);
      if (previousModels) {
        queryClient.setQueryData<ProviderModelInfo[]>(
          queryKey,
          previousModels.map((model) => ({ ...model, isEnabled })),
        );
      }

      return { previousModels, queryKey };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousModels) {
        queryClient.setQueryData(context.queryKey, context.previousModels);
      }
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.providers.models(variables.providerId),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.models.enabled(),
        exact: true,
      });
    },
  });
}
