import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AiEditingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ModelPickerDialog, type ModelPickerValue } from "@/components/model-picker-dialog";
import { getProviderIconById } from "@/lib/provider-icons";
import { useUpdateSumiSettings } from "@/mutations/settings";
import { listProviderModelsQueryOptions, listProvidersQueryOptions } from "@/queries/providers";
import { sumiSettingsQueryOptions } from "@/queries/settings";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsRow,
  SettingsSection,
} from "./settings-ui";

export function SumiPage() {
  const { data: settings, isPending: areSettingsPending } = useQuery(sumiSettingsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const updateSettings = useUpdateSumiSettings();
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [updateError, setUpdateError] = React.useState<string | null>(null);
  const promptActions = settings?.promptActions;
  const modelReference = promptActions?.model ?? null;
  const selectedProvider =
    providers.find((provider) => provider.id === modelReference?.providerId) ?? null;
  const selectedModelsQuery = useQuery({
    ...listProviderModelsQueryOptions(modelReference?.providerId ?? ""),
    enabled: modelReference !== null,
  });
  const selectedModel =
    selectedModelsQuery.data?.find(
      (model) => model.providerModelId === modelReference?.providerModelId,
    ) ?? null;
  const ProviderIcon = selectedProvider ? getProviderIconById(selectedProvider.catalogId) : null;
  const isPending = areSettingsPending || updateSettings.isPending;
  const modelName =
    selectedModel?.displayName?.trim() ||
    selectedModel?.providerModelId ||
    modelReference?.providerModelId ||
    null;

  function updatePromptActions(
    input: NonNullable<Parameters<typeof updateSettings.mutate>[0]["promptActions"]>,
  ) {
    setUpdateError(null);
    updateSettings.mutate(
      { promptActions: input },
      {
        onError: (error) => {
          setUpdateError(
            error instanceof Error ? error.message : "Failed to update Sumi settings.",
          );
        },
      },
    );
  }

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title="Sumi"
        description="Small AI-assisted actions, woven through Hanoki."
      />

      <SettingsSection
        title="Prompt actions"
        description="One-tap helpers that appear in the chat composer."
      >
        <SettingsRow
          icon={<HugeiconsIcon icon={AiEditingIcon} className="size-4" />}
          title="Sumi prompt actions"
          description="Enable Sumi's writing tools in the chat composer."
          control={
            <Switch
              aria-label="Enable Sumi prompt actions"
              checked={promptActions?.enabled ?? false}
              disabled={isPending || !modelReference}
              onCheckedChange={(enabled) => updatePromptActions({ enabled })}
            />
          }
        />
        <SettingsRow
          title="Model"
          description={
            modelReference
              ? (selectedProvider?.displayName ?? "Configured provider")
              : "Pick a configured model to enable this action."
          }
          control={
            <Button variant="secondary" disabled={isPending} onClick={() => setIsPickerOpen(true)}>
              {ProviderIcon ? <ProviderIcon className="size-3.5" /> : null}
              {modelName ?? "Choose model"}
            </Button>
          }
        />
      </SettingsSection>

      <SettingsError>{updateError}</SettingsError>

      <ModelPickerDialog
        open={isPickerOpen}
        value={modelReference}
        includeDisabledModels
        onOpenChange={setIsPickerOpen}
        onConfirm={(model: ModelPickerValue) =>
          updatePromptActions({
            enabled: true,
            model,
          })
        }
      />
    </SettingsPageShell>
  );
}
