import { Link } from "@tanstack/react-router";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { getProviderIconById } from "@/lib/provider-icons";
import { SUPPORTED_PROVIDERS } from "@shared/providers/catalog";
import { SettingsPageHeader, SettingsPageShell, SettingsRow, SettingsSection } from "./settings-ui";

export function ProviderPickerPage() {
  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title="Add provider"
        description="Connect an AI provider to bring its models into chat. Credentials never leave this device."
      />

      <SettingsSection title="Available providers">
        {SUPPORTED_PROVIDERS.map((provider) => {
          const ProviderIcon = getProviderIconById(provider.id);

          return (
            <SettingsRow
              key={provider.id}
              icon={<ProviderIcon className="size-4" />}
              title={provider.name}
              description={provider.description}
              control={
                provider.isAvailable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link
                        to="/settings/providers/new/$providerId"
                        params={{ providerId: provider.id }}
                      />
                    }
                  >
                    <HugeiconsIcon icon={Add01Icon} />
                    <span>Add</span>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Coming soon</span>
                )
              }
            />
          );
        })}
      </SettingsSection>
    </SettingsPageShell>
  );
}
