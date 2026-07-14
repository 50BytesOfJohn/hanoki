import { FilterHorizontalIcon, MoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Alert, Button, Card, Dropdown, Label, SearchField, Spinner } from "@heroui/react";
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
  const filterSelection = new Set([showEnabledOnly ? "enabled" : "all"]);
  const disabledBatchActions = [
    ...(isModelMutating || areAllModelsEnabled ? ["enable-all"] : []),
    ...(isModelMutating || areAllModelsDisabled ? ["disable-all"] : []),
  ];

  return (
    <Card variant="secondary" className="flex min-h-0 flex-1 flex-col">
      <Card.Content className="flex min-h-0 flex-1 flex-col">
        {modelsQuery.isPending ? (
          <Alert>
            <Alert.Indicator>
              <Spinner size="sm" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Loading models...</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : modelsQuery.isError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Failed to load models</Alert.Title>
              <Alert.Description>{getErrorMessage(modelsQuery.error)}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : models.length === 0 ? (
          <Alert>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>No models found</Alert.Title>
              <Alert.Description>This provider has no synced models yet.</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <SearchField
                aria-label="Search provider models"
                fullWidth
                value={modelSearchQuery}
                variant="secondary"
                onChange={setModelSearchQuery}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search models" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>

              <Dropdown>
                <Button
                  className="shrink-0"
                  isIconOnly
                  aria-label="Filter models"
                  variant="tertiary"
                >
                  <HugeiconsIcon icon={FilterHorizontalIcon} />
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    selectedKeys={filterSelection}
                    selectionMode="single"
                    onAction={(key) => setShowEnabledOnly(key === "enabled")}
                  >
                    <Dropdown.Item id="all" textValue="All models">
                      <Dropdown.ItemIndicator />
                      <Label>All models</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="enabled" textValue="Enabled only">
                      <Dropdown.ItemIndicator />
                      <Label>Enabled only</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              <Dropdown>
                <Button
                  isIconOnly
                  className="shrink-0"
                  aria-label="Model batch actions"
                  variant="tertiary"
                  isPending={isBatchMutating}
                  isDisabled={isModelMutating}
                >
                  <HugeiconsIcon icon={MoreIcon} />
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    disabledKeys={disabledBatchActions}
                    onAction={(key) => {
                      if (key === "enable-all") {
                        setProviderModelsEnabledMutation.mutate({
                          providerId,
                          isEnabled: true,
                        });
                        return;
                      }

                      if (key === "disable-all") {
                        setProviderModelsEnabledMutation.mutate({
                          providerId,
                          isEnabled: false,
                        });
                      }
                    }}
                  >
                    <Dropdown.Item id="enable-all" textValue="Enable all">
                      <Label>Enable all</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="disable-all" textValue="Disable all">
                      <Label>Disable all</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
              {isBatchMutating ? <Spinner size="sm" /> : null}
            </div>

            {updateModelMutation.isError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Failed to update model</Alert.Title>
                  <Alert.Description>
                    {getErrorMessage(updateModelMutation.error)}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {setProviderModelsEnabledMutation.isError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Failed to update provider models</Alert.Title>
                  <Alert.Description>
                    {getErrorMessage(setProviderModelsEnabledMutation.error)}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {filteredModels.length === 0 ? (
              <Alert>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>No matching models</Alert.Title>
                  <Alert.Description>
                    Try a different search term or disable the enabled-only filter.
                  </Alert.Description>
                </Alert.Content>
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
      </Card.Content>
    </Card>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error";
}
