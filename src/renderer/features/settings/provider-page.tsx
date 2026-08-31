import { useQuery } from "@tanstack/react-query";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { getProviderIconById } from "@/lib/provider-icons";
import { listProvidersQueryOptions } from "@/queries/providers";
import { getSupportedProviderById } from "@shared/providers/catalog";
import { ProviderConfigModal, ProviderModelsTab } from "./provider-page/tabs";
import { SettingsPageHeader, SettingsSectionLabel } from "./settings-ui";

interface ProviderPageProps {
  providerId: string;
}

export function ProviderPage({ providerId }: ProviderPageProps) {
  const providersQuery = useQuery(listProvidersQueryOptions);
  const provider = providersQuery.data?.find((item) => item.id === providerId);
  const catalogProvider = provider ? getSupportedProviderById(provider.catalogId) : null;
  const ProviderIcon = provider ? getProviderIconById(provider.catalogId) : null;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-6 px-6 pt-10 pb-6">
        <SettingsPageHeader
          leading={
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-secondary">
              {ProviderIcon ? <ProviderIcon className="size-5" /> : null}
            </div>
          }
          title={provider?.displayName ?? "Provider"}
          description={catalogProvider?.name ?? provider?.catalogId ?? ""}
          actions={
            <ProviderConfigModal
              providerId={providerId}
              trigger={
                <Button variant="ghost" className="text-muted-foreground">
                  <HugeiconsIcon icon={Settings02Icon} data-icon="inline-start" />
                  Configure
                </Button>
              }
            />
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <SettingsSectionLabel>Models</SettingsSectionLabel>
          <ProviderModelsTab providerId={providerId} catalogId={provider?.catalogId ?? null} />
        </div>
      </div>
    </main>
  );
}
