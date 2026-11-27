import { useQuery } from "@tanstack/react-query";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { getProviderIconById } from "@/lib/provider-icons";
import { listProvidersQueryOptions, providerBalanceQueryOptions } from "@/queries/providers";
import type { ProviderBalance } from "@shared/ipc";
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
  // Prepaid providers (SayGM) report what is left on the key; the rest answer null.
  const balanceQuery = useQuery(providerBalanceQueryOptions(providerId));
  const providerName = catalogProvider?.name ?? provider?.catalogId ?? "";

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
          description={
            balanceQuery.data ? (
              <>
                {providerName}
                <span aria-hidden="true"> · </span>
                <ProviderBalanceText balance={balanceQuery.data} />
              </>
            ) : (
              providerName
            )
          }
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

function ProviderBalanceText({ balance }: { balance: ProviderBalance }) {
  return (
    <span className="tabular-nums">
      {formatUsd(balance.balance)} left
      {balance.spent !== null ? ` · ${formatUsd(balance.spent)} spent` : null}
    </span>
  );
}

/** Cents are too coarse for a key topped up with a dollar, so small amounts keep four places. */
function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(amount) < 10 ? 4 : 2,
  }).format(amount);
}
