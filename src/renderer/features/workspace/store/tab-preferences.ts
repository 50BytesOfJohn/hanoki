import type { GlobalChatSettings } from "@shared/ipc";

import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";

export type TabPreferences = Pick<
  GlobalChatSettings,
  "tabOpenBehavior" | "tabInsertPosition" | "tabCloseFocus"
>;

const DEFAULT_TAB_PREFERENCES: TabPreferences = {
  tabOpenBehavior: "preview",
  tabInsertPosition: "next-to-active",
  tabCloseFocus: "recent",
};

/** Store actions run outside React, so they read the settings query's cache directly. */
export function getTabPreferences(): TabPreferences {
  return {
    ...DEFAULT_TAB_PREFERENCES,
    ...queryClient.getQueryData<GlobalChatSettings>(queryKeys.settings.globalChat()),
  };
}
