import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { getProviderIconById } from "@/lib/provider-icons";
import { listProviderModelsQueryOptions, listProvidersQueryOptions } from "@/queries/providers";

export interface ModelPickerValue {
  providerId: string;
  providerModelId: string;
}

interface ModelPickerDialogProps {
  open: boolean;
  value: ModelPickerValue | null;
  includeDisabledModels?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: ModelPickerValue) => void;
}

export function ModelPickerDialog({
  open,
  value,
  includeDisabledModels = false,
  onOpenChange,
  onConfirm,
}: ModelPickerDialogProps) {
  const { data: providers = [], isPending: areProvidersPending } =
    useQuery(listProvidersQueryOptions);
  const [providerId, setProviderId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const modelsQuery = useQuery({
    ...listProviderModelsQueryOptions(providerId ?? ""),
    enabled: providerId !== null,
  });

  React.useEffect(() => {
    if (open) {
      // Reopen on the provider of the current value so its model is one step away.
      setProviderId(value?.providerId ?? null);
      setSearch("");
    }
  }, [open, value]);

  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? null;
  const SelectedProviderIcon = selectedProvider
    ? getProviderIconById(selectedProvider.catalogId)
    : null;
  const visibleModels = React.useMemo(
    () =>
      (modelsQuery.data ?? []).filter(
        (model) =>
          model.status === "active" && (includeDisabledModels || model.isEnabled),
      ),
    [includeDisabledModels, modelsQuery.data],
  );

  function showProviders() {
    setProviderId(null);
    setSearch("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-1.5 border-b border-separator px-3 py-2.5 pe-12">
          {selectedProvider ? (
            <Button
              aria-label="Back to providers"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={showProviders}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </Button>
          ) : null}
          {SelectedProviderIcon ? <SelectedProviderIcon className="size-4 shrink-0" /> : null}
          <DialogTitle className="truncate text-sm">
            {selectedProvider ? selectedProvider.displayName : "Select model"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {selectedProvider
              ? "Choose a model from this provider."
              : "Choose a configured provider to browse its models."}
          </DialogDescription>
        </DialogHeader>

        <Command
          className="h-[min(32rem,calc(100vh-8rem))] rounded-none! bg-transparent"
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !search && selectedProvider) {
              event.preventDefault();
              showProviders();
            }
          }}
        >
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder={selectedProvider ? "Search models…" : "Search providers…"}
          />
          <CommandList className="max-h-none flex-1 scroll-py-2">
            {selectedProvider ? (
              modelsQuery.isPending ? (
                <CommandStateMessage>
                  <Spinner /> Loading models…
                </CommandStateMessage>
              ) : modelsQuery.isError ? (
                <CommandStateMessage>Models could not be loaded.</CommandStateMessage>
              ) : (
                <>
                  <CommandEmpty>No matching models.</CommandEmpty>
                  <CommandGroup>
                    {visibleModels.map((model) => (
                      <CommandItem
                        key={model.id}
                        value={`${model.displayName ?? ""} ${model.providerModelId} ${model.id}`}
                        data-checked={
                          value?.providerId === model.providerId &&
                          value.providerModelId === model.providerModelId
                        }
                        className="py-2"
                        onSelect={() => {
                          onConfirm({
                            providerId: model.providerId,
                            providerModelId: model.providerModelId,
                          });
                          onOpenChange(false);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {model.displayName?.trim() || model.providerModelId}
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {model.providerModelId}
                          </div>
                        </div>
                        {!model.isEnabled ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Hidden in chat
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )
            ) : areProvidersPending ? (
              <CommandStateMessage>
                <Spinner /> Loading providers…
              </CommandStateMessage>
            ) : providers.length === 0 ? (
              <CommandStateMessage>No providers configured.</CommandStateMessage>
            ) : (
              <>
                <CommandEmpty>No matching providers.</CommandEmpty>
                <CommandGroup>
                  {providers.map((provider) => {
                    const ProviderIcon = getProviderIconById(provider.catalogId);

                    return (
                      <CommandItem
                        key={provider.id}
                        value={`${provider.displayName} ${provider.id}`}
                        className="py-2.5"
                        onSelect={() => {
                          setProviderId(provider.id);
                          setSearch("");
                        }}
                      >
                        <ProviderIcon className="size-4.5" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {provider.displayName}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandStateMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
