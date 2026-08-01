import { ArrowUpDoubleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { updatesApi } from "@/api/updates";
import { selectUpdate, useSystemStore } from "@/stores/system-store";

/**
 * Title-bar affordance for an update that has already finished downloading.
 * Checking and downloading stay invisible on purpose — they are background
 * work the user never waits on. Settings → General is where the full state
 * (including failures) lives.
 */
export function UpdateToolbarButton() {
  const update = useSystemStore(selectUpdate);

  if (update.status !== "ready") {
    return null;
  }

  const version = update.readyVersion ?? "A new version";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="xs"
            className="gap-1.5"
            aria-label={`Restart to update to ${version}`}
            onClick={() => {
              void updatesApi.install();
            }}
          >
            <HugeiconsIcon icon={ArrowUpDoubleIcon} className="size-3.5!" />
            <span>Update</span>
          </Button>
        }
      />
      <TooltipContent>{version} is ready — restart to install.</TooltipContent>
    </Tooltip>
  );
}
