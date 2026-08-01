import { ArrowUpDoubleIcon, LinkSquare02Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { updatesApi } from "@/api/updates";
import { SettingsError, SettingsRow, SettingsSection } from "@/features/settings/settings-ui";
import { selectUpdate, useSystemStore } from "@/stores/system-store";

/** Copy for the version row's second line, one per updater state. */
const STATUS_DESCRIPTION = {
  unsupported: "Automatic updates are off in this build. Grab new versions from GitHub.",
  idle: "Hanoki checks for updates in the background and downloads them automatically.",
  checking: "Checking for updates…",
  downloading: "Downloading the new version in the background. You can keep working.",
  ready: "Restart to finish installing.",
  error: "The last check failed. Hanoki keeps running on this version.",
} as const;

export function UpdateSettingsSection() {
  const update = useSystemStore(selectUpdate);
  const isBusy = update.status === "checking" || update.status === "downloading";

  return (
    <SettingsSection title="About">
      <SettingsRow
        title={`Hanoki ${update.currentVersion}`}
        description={STATUS_DESCRIPTION[update.status]}
        control={
          update.status === "ready" ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void updatesApi.install();
              }}
            >
              <HugeiconsIcon icon={ArrowUpDoubleIcon} />
              <span>Restart to update</span>
            </Button>
          ) : update.status === "unsupported" ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                void updatesApi.openReleases();
              }}
            >
              <HugeiconsIcon icon={LinkSquare02Icon} />
              <span>Releases</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={isBusy}
              onClick={() => {
                void updatesApi.check();
              }}
            >
              {isBusy ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={Refresh01Icon} />}
              <span>Check for updates</span>
            </Button>
          )
        }
      >
        {update.status === "error" && update.error ? (
          <SettingsError>{update.error}</SettingsError>
        ) : null}
      </SettingsRow>
    </SettingsSection>
  );
}
