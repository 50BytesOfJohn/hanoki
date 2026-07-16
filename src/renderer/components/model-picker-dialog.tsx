import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft01Icon, CheckmarkCircle02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getProviderIconById } from "@/lib/provider-icons";
import { listProviderModelsQueryOptions, listProvidersQueryOptions } from "@/queries/providers";
import { cn } from "@/lib/utils";

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
  const [pendingValue, setPendingValue] = React.useState<ModelPickerValue | null>(value);
  const [search, setSearch] = React.useState("");
  const modelsQuery = useQuery({
    ...listProviderModelsQueryOptions(providerId ?? ""),
    enabled: providerId !== null,
  });

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setProviderId(null);
    setPendingValue(value);
    setSearch("");
  }, [open, value]);

  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? null;
  const visibleModels = React.useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return (modelsQuery.data ?? []).filter((model) => {
      if (model.status !== "active") {
        return false;
      }
      if (!includeDisabledModels && !model.isEnabled) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      return `${model.displayName ?? ""} ${model.providerModelId}`
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    });
  }, [includeDisabledModels, modelsQuery.data, search]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setProviderId(null);
      setSearch("");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(36rem,calc(100vh-3rem))] max-w-xl grid-rows-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12">
          <div className="flex items-center gap-2">
            {selectedProvider ? (
              <Button
                aria-label="Back to providers"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setProviderId(null);
                  setSearch("");
                }}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} />
              </Button>
            ) : null}
            <div className="min-w-0">
              <DialogTitle>
                {selectedProvider ? selectedProvider.displayName : "Select model"}
              </DialogTitle>
              <DialogDescription>
                {selectedProvider
                  ? "Choose a model, then confirm your selection."
                  : "Choose a configured provider to browse its models."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {selectedProvider ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative shrink-0 border-b border-border p-3">
              <HugeiconsIcon
                icon={Search01Icon}
                className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search models"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models"
                className="pl-8"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar">
              {modelsQuery.isPending ? (
                <DialogStateMessage>Loading models…</DialogStateMessage>
              ) : modelsQuery.isError ? (
                <DialogStateMessage>Models could not be loaded.</DialogStateMessage>
              ) : visibleModels.length === 0 ? (
                <DialogStateMessage>No matching models.</DialogStateMessage>
              ) : (
                <div className="space-y-1">
                  {visibleModels.map((model) => {
                    const isSelected =
                      pendingValue?.providerId === model.providerId &&
                      pendingValue.providerModelId === model.providerModelId;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        aria-pressed={isSelected}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors outline-none hover:bg-hover focus-visible:border-focus/70",
                          isSelected ? "border-focus/30 bg-accent-soft" : null,
                        )}
                        onClick={() =>
                          setPendingValue({
                            providerId: model.providerId,
                            providerModelId: model.providerModelId,
                          })
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
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
                        {isSelected ? (
                          <HugeiconsIcon
                            icon={CheckmarkCircle02Icon}
                            className="size-4 shrink-0 text-accent-soft-foreground"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar">
            {areProvidersPending ? (
              <DialogStateMessage>Loading providers…</DialogStateMessage>
            ) : providers.length === 0 ? (
              <DialogStateMessage>No providers configured.</DialogStateMessage>
            ) : (
              <div className="space-y-1">
                {providers.map((provider) => {
                  const ProviderIcon = getProviderIconById(provider.catalogId);

                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors outline-none hover:bg-hover focus-visible:border-focus/70"
                      onClick={() => setProviderId(provider.id)}
                    >
                      <ProviderIcon className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {provider.displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="m-0 shrink-0 rounded-none px-4 py-3">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !selectedProvider || !pendingValue || pendingValue.providerId !== selectedProvider.id
            }
            onClick={() => {
              if (!pendingValue || pendingValue.providerId !== selectedProvider?.id) {
                return;
              }
              onConfirm(pendingValue);
              handleOpenChange(false);
            }}
          >
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogStateMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
