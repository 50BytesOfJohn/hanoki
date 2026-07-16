import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AiContentGenerator01Icon, AiEditingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SumiModelReference, SumiSettingsUpdateInput } from "@shared/ipc";

import { ModelPickerDialog, type ModelPickerValue } from "@/components/model-picker-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

type ModelPickerTarget = keyof Pick<SumiSettingsUpdateInput, "promptActions" | "titleGeneration">;

export function SumiPage() {
  const { data: settings, isPending: areSettingsPending } = useQuery(sumiSettingsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const updateSettings = useUpdateSumiSettings();
  const [pickerTarget, setPickerTarget] = React.useState<ModelPickerTarget | null>(null);
  const [updateError, setUpdateError] = React.useState<string | null>(null);
  const promptActions = settings?.promptActions;
  const titleGeneration = settings?.titleGeneration;
  const isPending = areSettingsPending || updateSettings.isPending;

  function updateSumiSettings(input: SumiSettingsUpdateInput) {
    setUpdateError(null);
    updateSettings.mutate(input, {
      onError: (error) => {
        setUpdateError(error instanceof Error ? error.message : "Failed to update Sumi settings.");
      },
    });
  }

  const pickerValue =
    pickerTarget === "promptActions"
      ? (promptActions?.model ?? null)
      : pickerTarget === "titleGeneration"
        ? (titleGeneration?.model ?? null)
        : null;

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
              disabled={isPending || !promptActions?.model}
              onCheckedChange={(enabled) => updateSumiSettings({ promptActions: { enabled } })}
            />
          }
        />
        <ModelSettingsRow
          modelReference={promptActions?.model ?? null}
          providers={providers}
          isPending={isPending}
          onChoose={() => setPickerTarget("promptActions")}
        />
      </SettingsSection>

      <SettingsSection
        title="Chat titles"
        description="Generate concise names for chats with a dedicated Sumi model."
      >
        <SettingsRow
          icon={<HugeiconsIcon icon={AiContentGenerator01Icon} className="size-4" />}
          title="Title generation"
          description="Show the title regeneration action and allow Sumi to rename chats."
          control={
            <Switch
              aria-label="Enable Sumi title generation"
              checked={titleGeneration?.enabled ?? false}
              disabled={isPending || !titleGeneration?.model}
              onCheckedChange={(enabled) => updateSumiSettings({ titleGeneration: { enabled } })}
            />
          }
        />
        <SettingsRow
          title="Automatic titles"
          description="Generate a title after the first user message in a new chat."
          control={
            <Switch
              aria-label="Automatically generate chat titles"
              checked={titleGeneration?.autoGenerate ?? false}
              disabled={isPending || !titleGeneration?.enabled}
              onCheckedChange={(autoGenerate) =>
                updateSumiSettings({ titleGeneration: { autoGenerate } })
              }
            />
          }
        />
        <ModelSettingsRow
          modelReference={titleGeneration?.model ?? null}
          providers={providers}
          isPending={isPending}
          onChoose={() => setPickerTarget("titleGeneration")}
        />
      </SettingsSection>

      <SettingsError>{updateError}</SettingsError>

      <ModelPickerDialog
        open={pickerTarget !== null}
        value={pickerValue}
        includeDisabledModels
        onOpenChange={(open) => {
          if (!open) {
            setPickerTarget(null);
          }
        }}
        onConfirm={(model: ModelPickerValue) => {
          if (!pickerTarget) {
            return;
          }

          updateSumiSettings({
            [pickerTarget]: {
              enabled: true,
              model,
            },
          });
        }}
      />
    </SettingsPageShell>
  );
}

function ModelSettingsRow({
  modelReference,
  providers,
  isPending,
  onChoose,
}: {
  modelReference: SumiModelReference | null;
  providers: Awaited<ReturnType<typeof window.electronAPI.listProviders>>;
  isPending: boolean;
  onChoose: () => void;
}) {
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
  const modelName =
    selectedModel?.displayName?.trim() ||
    selectedModel?.providerModelId ||
    modelReference?.providerModelId ||
    null;

  return (
    <SettingsRow
      title="Model"
      description={
        modelReference ? (
          <span className="flex items-center gap-1.5">
            {ProviderIcon ? <ProviderIcon className="size-3.5 shrink-0" /> : null}
            <span className="truncate">
              {selectedProvider?.displayName ?? "Configured provider"}
              {modelName ? ` · ${modelName}` : ""}
            </span>
          </span>
        ) : (
          "Pick a configured model to enable this feature."
        )
      }
      control={
        <Button variant="secondary" disabled={isPending} onClick={onChoose}>
          {modelReference ? "Change" : "Choose model"}
        </Button>
      }
    />
  );
}
