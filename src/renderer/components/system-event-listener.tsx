import { useEffect } from "react";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { updatesApi } from "@/api/updates";
import { toastManager } from "@/components/ui/toast";
import { applyItemTitleUpdate } from "@/features/items/item-title-events";
import { useSystemStore } from "../stores/system-store";

export function SystemEventListener() {
  const handleSystemEvent = useSystemStore((s) => s.handleSystemEvent);
  const syncState = useSystemStore((s) => s.syncState);

  useEffect(() => {
    void window.electronAPI.getSystemState().then(syncState);
    return window.electronAPI.onSystemEvent((event) => {
      handleSystemEvent(event);

      if (event.type === "item:title-updated") {
        applyItemTitleUpdate(event);
        return;
      }

      if (event.type === "settings:global-chat-updated") {
        queryClient.setQueryData(queryKeys.settings.globalChat(), event.settings);
        return;
      }

      if (event.type === "update:state") {
        // The main process stops checking once an update is staged, so `ready`
        // is broadcast exactly once per download — no toast de-duping needed.
        if (event.update.status === "ready") {
          toastManager.add({
            type: "success",
            title: `${event.update.readyVersion ?? "A new version"} is ready`,
            description: "Restart Hanoki to finish updating.",
            timeout: 0,
            actionProps: {
              children: "Restart",
              onClick: () => {
                void updatesApi.install();
              },
            },
          });
        }
        return;
      }

      if (event.type !== "providers:model-sync:completed") {
        return;
      }

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.providers.models(event.providerId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.models.enabled(),
          exact: true,
        }),
      ]);
    });
  }, [handleSystemEvent, syncState]);

  return null;
}
