import { queryOptions } from "@tanstack/react-query";
import { settingsApi } from "../api/settings";
import { queryKeys } from "./keys";

export const globalChatSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.settings.globalChat(),
  queryFn: () => settingsApi.getGlobalChat(),
  staleTime: Number.POSITIVE_INFINITY,
});
