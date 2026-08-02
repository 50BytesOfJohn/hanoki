import { queryOptions } from "@tanstack/react-query";
import { settingsApi } from "../api/settings";
import { queryKeys } from "./keys";

export const globalChatSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.settings.globalChat(),
  queryFn: () => settingsApi.getGlobalChat(),
  staleTime: Number.POSITIVE_INFINITY,
});

export const sumiSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.settings.sumi(),
  queryFn: () => settingsApi.getSumi(),
  staleTime: Number.POSITIVE_INFINITY,
});

export const toolSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.settings.tools(),
  queryFn: () => settingsApi.getTools(),
  staleTime: Number.POSITIVE_INFINITY,
});
