import { useQuery } from "@tanstack/react-query";
import { Button, Chip } from "@heroui/react";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { listProvidersQueryOptions } from "@/queries/providers";
import { getSupportedProviderById } from "@shared/providers/catalog";
import { ProviderConfigModal, ProviderModelsTab } from "./provider-page/tabs";

interface ProviderPageProps {
  providerId: string;
}

export function ProviderPage({ providerId }: ProviderPageProps) {
  const providersQuery = useQuery(listProvidersQueryOptions);
  const provider = providersQuery.data?.find((item) => item.id === providerId);
  const catalogProvider = provider ? getSupportedProviderById(provider.catalogId) : null;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4 pb-2 pt-4">
          <div className="space-y-3">
            <Chip size="sm" variant="soft">
              {catalogProvider?.name ?? provider?.catalogId ?? "Provider"}
            </Chip>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {provider?.displayName ?? "Provider"}
            </h1>
          </div>

          <ProviderConfigModal
            providerId={providerId}
            trigger={
              <Button variant="tertiary">
                <HugeiconsIcon icon={Settings02Icon} />
                Configure
              </Button>
            }
          />
        </div>

        <ProviderModelsTab providerId={providerId} />
      </div>
    </main>
  );
}
