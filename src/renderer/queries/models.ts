import { queryOptions } from "@tanstack/react-query";
import type { ProviderModelInfo } from "@shared/ipc";
import { modelsApi } from "@/api/models";
import { queryKeys } from "./keys";

/** Every active model, enabled or not; the picker and the model library share it. */
export const listModelsQueryOptions = queryOptions({
  queryKey: queryKeys.models.list(),
  queryFn: () => modelsApi.list(),
});

function selectEnabledModels(models: ProviderModelInfo[]) {
  return models.filter((model) => model.isEnabled);
}

/** Same cache as `listModelsQueryOptions`, narrowed to what chat can use. */
export const listEnabledModelsQueryOptions = queryOptions({
  ...listModelsQueryOptions,
  select: selectEnabledModels,
});

export const listRecentModelsQueryOptions = queryOptions({
  queryKey: queryKeys.models.recent(),
  queryFn: () => modelsApi.listRecent(),
});
