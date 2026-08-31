import {
  Alert01Icon,
  ArrowDataTransferVerticalIcon,
  Cancel01Icon,
  FilterHorizontalIcon,
  MoreIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { useSetProviderModelsEnabled, useUpdateProviderModel } from "@/mutations/models";
import { listProviderModelsQueryOptions } from "@/queries/providers";
import {
  decorateModel,
  ProviderModelsList,
  type DecoratedModel,
} from "./models/provider-models-list";

interface ProviderModelsTabProps {
  providerId: string;
  /** Provider catalog id, used as the creator for providers that report none. */
  catalogId: string | null;
}

const MODEL_SORT_ORDERS = {
  released: "Newest first",
  name: "Name (A–Z)",
  context: "Largest context",
  price: "Lowest price",
} as const;

type ModelSortOrder = keyof typeof MODEL_SORT_ORDERS;

export function ProviderModelsTab({ providerId, catalogId }: ProviderModelsTabProps) {
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<ModelSortOrder>("released");
  const deferredModelSearchQuery = useDeferredValue(modelSearchQuery);
  const modelsQuery = useQuery(listProviderModelsQueryOptions(providerId));
  const updateModelMutation = useUpdateProviderModel();
  const setProviderModelsEnabledMutation = useSetProviderModelsEnabled();
  const models = modelsQuery.data ?? [];

  // "codex" is the ChatGPT sign-in, not a lab — its models are OpenAI's.
  const fallbackCreator = catalogId === "codex" ? "openai" : catalogId;
  const decoratedModels = useMemo(
    () => models.map((model) => decorateModel(model, fallbackCreator)),
    [models, fallbackCreator],
  );

  const normalizedSearchQuery = deferredModelSearchQuery.trim().toLocaleLowerCase();
  const visibleModels = useMemo(() => {
    const filtered = decoratedModels.filter((entry) => {
      if (showEnabledOnly && !entry.model.isEnabled) {
        return false;
      }

      if (normalizedSearchQuery.length === 0) {
        return true;
      }

      return [entry.name, entry.model.providerModelId, entry.details.creator ?? ""].some((field) =>
        field.toLocaleLowerCase().includes(normalizedSearchQuery),
      );
    });

    return filtered.sort(compareBy(sortOrder));
  }, [decoratedModels, normalizedSearchQuery, showEnabledOnly, sortOrder]);

  const areAllModelsEnabled = models.length > 0 && models.every((model) => model.isEnabled);
  const areAllModelsDisabled = models.length > 0 && models.every((model) => !model.isEnabled);
  const isBatchMutating = setProviderModelsEnabledMutation.isPending;
  const isModelMutating = isBatchMutating || updateModelMutation.isPending;
  const enabledCount = models.filter((model) => model.isEnabled).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border p-3">
      {modelsQuery.isPending ? (
        <Alert>
          <Spinner />
          <AlertTitle>Loading models...</AlertTitle>
        </Alert>
      ) : modelsQuery.isError ? (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert01Icon} />
          <AlertTitle>Failed to load models</AlertTitle>
          <AlertDescription>{getErrorMessage(modelsQuery.error)}</AlertDescription>
        </Alert>
      ) : models.length === 0 ? (
        <Alert>
          <HugeiconsIcon icon={Alert01Icon} />
          <AlertTitle>No models found</AlertTitle>
          <AlertDescription>This provider has no synced models yet.</AlertDescription>
        </Alert>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <InputGroup>
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search provider models"
                placeholder="Search models"
                value={modelSearchQuery}
                onChange={(event) => setModelSearchQuery(event.target.value)}
              />
              {modelSearchQuery ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear search"
                    onClick={() => setModelSearchQuery("")}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="shrink-0 text-muted-foreground"
                    size="icon"
                    aria-label="Sort models"
                    variant="ghost"
                  />
                }
              >
                <HugeiconsIcon icon={ArrowDataTransferVerticalIcon} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={sortOrder}
                  onValueChange={(value) => {
                    if (isModelSortOrder(value)) {
                      setSortOrder(value);
                    }
                  }}
                >
                  {Object.entries(MODEL_SORT_ORDERS).map(([value, label]) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="shrink-0 text-muted-foreground"
                    size="icon"
                    aria-label="Filter models"
                    variant="ghost"
                  />
                }
              >
                <HugeiconsIcon icon={FilterHorizontalIcon} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={showEnabledOnly ? "enabled" : "all"}
                  onValueChange={(value) => setShowEnabledOnly(value === "enabled")}
                >
                  <DropdownMenuRadioItem value="all">All models</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="enabled">Enabled only</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="shrink-0 text-muted-foreground"
                    size="icon"
                    aria-label="Model batch actions"
                    variant="ghost"
                    disabled={isModelMutating}
                  />
                }
              >
                {isBatchMutating ? <Spinner /> : <HugeiconsIcon icon={MoreIcon} />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={isModelMutating || areAllModelsEnabled}
                    onClick={() => {
                      setProviderModelsEnabledMutation.mutate({
                        providerId,
                        isEnabled: true,
                      });
                    }}
                  >
                    Enable all
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isModelMutating || areAllModelsDisabled}
                    onClick={() => {
                      setProviderModelsEnabledMutation.mutate({
                        providerId,
                        isEnabled: false,
                      });
                    }}
                  >
                    Disable all
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {updateModelMutation.isError ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert01Icon} />
              <AlertTitle>Failed to update model</AlertTitle>
              <AlertDescription>{getErrorMessage(updateModelMutation.error)}</AlertDescription>
            </Alert>
          ) : null}

          {setProviderModelsEnabledMutation.isError ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert01Icon} />
              <AlertTitle>Failed to update provider models</AlertTitle>
              <AlertDescription>
                {getErrorMessage(setProviderModelsEnabledMutation.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          {visibleModels.length === 0 ? (
            <Alert>
              <HugeiconsIcon icon={Alert01Icon} />
              <AlertTitle>No matching models</AlertTitle>
              <AlertDescription>
                Try a different search term or disable the enabled-only filter.
              </AlertDescription>
            </Alert>
          ) : (
            <ProviderModelsList
              models={visibleModels}
              areSwitchesDisabled={isModelMutating}
              onModelEnabledChange={(modelId, isEnabled) => {
                updateModelMutation.mutate({
                  providerId,
                  modelId,
                  input: { isEnabled },
                });
              }}
            />
          )}

          <p className="shrink-0 text-[11px] text-muted-foreground/80">
            {visibleModels.length} of {models.length} models · {enabledCount} enabled
          </p>
        </div>
      )}
    </div>
  );
}

function isModelSortOrder(value: string): value is ModelSortOrder {
  return value in MODEL_SORT_ORDERS;
}

function compareBy(sortOrder: ModelSortOrder): (a: DecoratedModel, b: DecoratedModel) => number {
  switch (sortOrder) {
    case "released":
      // Models the provider gave no date for sink below the dated ones.
      return (a, b) =>
        (b.details.releasedAt ?? -1) - (a.details.releasedAt ?? -1) || compareByName(a, b);
    case "context":
      return (a, b) =>
        (b.details.contextLength ?? -1) - (a.details.contextLength ?? -1) || compareByName(a, b);
    case "price":
      return (a, b) =>
        (a.details.pricing?.input ?? Number.POSITIVE_INFINITY) -
          (b.details.pricing?.input ?? Number.POSITIVE_INFINITY) || compareByName(a, b);
    case "name":
      return compareByName;
  }
}

function compareByName(a: DecoratedModel, b: DecoratedModel): number {
  return a.name.localeCompare(b.name);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error";
}
