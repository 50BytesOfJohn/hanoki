import {
  Alert01Icon,
  Cancel01Icon,
  FilterHorizontalIcon,
  MoreIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

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
import { ProviderModelsTable } from "./models/provider-models-table";

interface ProviderModelsTabProps {
  providerId: string;
}

export function ProviderModelsTab({ providerId }: ProviderModelsTabProps) {
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const deferredModelSearchQuery = useDeferredValue(modelSearchQuery);
  const modelsQuery = useQuery(listProviderModelsQueryOptions(providerId));
  const updateModelMutation = useUpdateProviderModel();
  const setProviderModelsEnabledMutation = useSetProviderModelsEnabled();
  const models = modelsQuery.data ?? [];
  const normalizedSearchQuery = deferredModelSearchQuery.trim().toLocaleLowerCase();
  const filteredModels = models.filter((model) => {
    if (showEnabledOnly && !model.isEnabled) {
      return false;
    }

    if (normalizedSearchQuery.length === 0) {
      return true;
    }

    const displayName = model.displayName?.trim().toLocaleLowerCase() ?? "";
    const providerModelId = model.providerModelId.toLocaleLowerCase();
    return (
      displayName.includes(normalizedSearchQuery) || providerModelId.includes(normalizedSearchQuery)
    );
  });
  const areAllModelsEnabled = models.length > 0 && models.every((model) => model.isEnabled);
  const areAllModelsDisabled = models.length > 0 && models.every((model) => !model.isEnabled);
  const isBatchMutating = setProviderModelsEnabledMutation.isPending;
  const isModelMutating = isBatchMutating || updateModelMutation.isPending;

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
            {isBatchMutating ? <Spinner /> : null}
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

          {filteredModels.length === 0 ? (
            <Alert>
              <HugeiconsIcon icon={Alert01Icon} />
              <AlertTitle>No matching models</AlertTitle>
              <AlertDescription>
                Try a different search term or disable the enabled-only filter.
              </AlertDescription>
            </Alert>
          ) : (
            <ProviderModelsTable
              models={filteredModels}
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
        </div>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error";
}
