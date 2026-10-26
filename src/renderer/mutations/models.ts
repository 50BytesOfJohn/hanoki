import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ProviderModelInfo, RecentModelUsage, UpdateModelInput } from "@shared/ipc";
import type { ReasoningEffort } from "@shared/models/reasoning";
import { modelsApi } from "../api/models";
import { queryKeys } from "../queries/keys";

type ModelListSnapshot = [queryKey: readonly unknown[], models: ProviderModelInfo[] | undefined][];

function applyModelInput(model: ProviderModelInfo, input: UpdateModelInput): ProviderModelInfo {
  return {
    ...model,
    ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.isPinned !== undefined ? { pinnedAt: input.isPinned ? Date.now() : null } : {}),
    ...(input.rememberedEffort !== undefined ? { rememberedEffort: input.rememberedEffort } : {}),
  };
}

/** Patches the provider's model list and the app-wide list, returning both for rollback. */
async function patchModelLists(
  queryClient: QueryClient,
  providerId: string,
  patch: (model: ProviderModelInfo) => ProviderModelInfo,
): Promise<ModelListSnapshot> {
  const queryKeysToPatch = [queryKeys.providers.models(providerId), queryKeys.models.list()];

  return Promise.all(
    queryKeysToPatch.map(async (queryKey) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previous = queryClient.getQueryData<ProviderModelInfo[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<ProviderModelInfo[]>(queryKey, previous.map(patch));
      }

      return [queryKey, previous] as const;
    }),
  );
}

function restoreModelLists(queryClient: QueryClient, snapshot: ModelListSnapshot | undefined) {
  for (const [queryKey, models] of snapshot ?? []) {
    if (models) {
      queryClient.setQueryData(queryKey, models);
    }
  }
}

function invalidateModelLists(queryClient: QueryClient, providerId: string) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.providers.models(providerId),
    exact: true,
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.models.list(), exact: true });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      modelId,
      input,
    }: {
      providerId: string;
      modelId: string;
      input: UpdateModelInput;
    }) => modelsApi.update(modelId, input),
    onMutate: ({ providerId, modelId, input }) =>
      patchModelLists(queryClient, providerId, (model) =>
        model.id === modelId ? applyModelInput(model, input) : model,
      ),
    onError: (_error, _variables, snapshot) => restoreModelLists(queryClient, snapshot),
    onSettled: (_data, _error, variables) =>
      invalidateModelLists(queryClient, variables.providerId),
  });
}

export function useSetProviderModelsEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ providerId, isEnabled }: { providerId: string; isEnabled: boolean }) =>
      modelsApi.setProviderEnabled(providerId, isEnabled),
    onMutate: ({ providerId, isEnabled }) =>
      patchModelLists(queryClient, providerId, (model) =>
        model.providerId === providerId ? { ...model, isEnabled } : model,
      ),
    onError: (_error, _variables, snapshot) => restoreModelLists(queryClient, snapshot),
    onSettled: (_data, _error, variables) =>
      invalidateModelLists(queryClient, variables.providerId),
  });
}

export function useRemoveRecentModel() {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.models.recent();

  return useMutation({
    mutationFn: ({
      modelId,
      reasoningEffort,
    }: {
      modelId: string;
      reasoningEffort: ReasoningEffort | null;
    }) => modelsApi.removeRecent(modelId, reasoningEffort),
    onMutate: async ({ modelId, reasoningEffort }) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previous = queryClient.getQueryData<RecentModelUsage[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<RecentModelUsage[]>(
          queryKey,
          previous.filter(
            (usage) => usage.modelId !== modelId || usage.reasoningEffort !== reasoningEffort,
          ),
        );
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}
