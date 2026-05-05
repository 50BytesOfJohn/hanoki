import { queryOptions } from "@tanstack/react-query";
import { modelsApi } from "@/api/models";
import { queryKeys } from "./keys";

export const listEnabledModelsQueryOptions = queryOptions({
  queryKey: queryKeys.models.enabled(),
  queryFn: () => modelsApi.listEnabled(),
});
