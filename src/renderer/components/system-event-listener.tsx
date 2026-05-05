import { useEffect } from "react";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { useSystemStore } from "../stores/system-store";

export function SystemEventListener() {
  const handleSystemEvent = useSystemStore((s) => s.handleSystemEvent);
  const syncState = useSystemStore((s) => s.syncState);

  useEffect(() => {
    void window.electronAPI.getSystemState().then(syncState);
    return window.electronAPI.onSystemEvent((event) => {
      handleSystemEvent(event);

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
