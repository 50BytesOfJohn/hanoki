import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert02Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModelLibraryDialog } from "@/features/chat/model-picker/model-library-dialog";
import { ModelPickerCommand } from "@/features/chat/model-picker/model-picker-command";
import { getModelLabel } from "@/features/chat/model-picker/model-picker-data";
import { CURRENT_ITEM_CLASS, EffortLabel } from "@/features/chat/model-picker/model-picker-parts";
import { getProviderIconById } from "@/lib/provider-icons";
import type { ChatModelSelection } from "@/features/chat/model-picker/use-chat-model-selection";
import { listModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";
import type { ProviderInfo, ProviderModelInfo } from "@shared/ipc";
import { resolveReasoningEffortForModel, type ReasoningEffort } from "@shared/models/reasoning";
import type { WorkflowModelRef } from "@shared/workflow/graph";
import {
  formatWorkflowModelUnavailable,
  getProviderModelIdFromModelId,
  type WorkflowModelUnavailableReason,
} from "@shared/workflow/model-availability";
import { cn } from "cn";

import { useGetModelUnavailableReason } from "./workflow-model-availability";

function useWorkflowModelSelection(
  value: WorkflowModelRef | null,
  onChange: (value: WorkflowModelRef) => void,
): ChatModelSelection {
  const { data: models = [] } = useQuery(listModelsQueryOptions);
  const model = models.find((candidate) => candidate.id === value?.modelId) ?? null;
  const offered = model?.reasoningEfforts ?? [];
  const effort =
    value?.reasoningEffort && offered.includes(value.reasoningEffort)
      ? value.reasoningEffort
      : null;

  const getEffortFor = React.useCallback(
    (candidate: ProviderModelInfo) =>
      candidate.id === model?.id
        ? effort
        : resolveReasoningEffortForModel({
            offered: candidate.reasoningEfforts ?? [],
            remembered: candidate.rememberedEffort,
            carried: effort,
          }),
    [effort, model?.id],
  );

  const selectModel = React.useCallback(
    (
      candidate: ProviderModelInfo,
      nextEffort: ReasoningEffort | null = getEffortFor(candidate),
    ) => {
      onChange({
        modelId: candidate.id,
        reasoningEffort: (candidate.reasoningEfforts?.length ?? 0) > 0 ? nextEffort : null,
      });
    },
    [getEffortFor, onChange],
  );

  const setEffort = React.useCallback(
    (nextEffort: ReasoningEffort | null) => {
      if (model) onChange({ modelId: model.id, reasoningEffort: nextEffort });
    },
    [model, onChange],
  );

  return { model, effort, getEffortFor, selectModel, setEffort };
}

/** The provider's logo, so the same model through two providers tells apart at a glance. */
export function ProviderLogo({
  model,
  className,
}: {
  model: Pick<ProviderModelInfo, "providerId">;
  className?: string;
}) {
  const { data: provider } = useQuery({
    ...listProvidersQueryOptions,
    select: (providers: ProviderInfo[]) =>
      providers.find((candidate) => candidate.id === model.providerId),
  });
  const Icon = provider ? getProviderIconById(provider.catalogId) : null;
  return Icon ? (
    <span title={provider?.displayName} className="flex shrink-0">
      <Icon className={cn("size-3 shrink-0", className)} />
    </span>
  ) : null;
}

/** "Model removed" / "Model turned off", in the warning tone. */
function ModelUnavailableLabel({ reason }: { reason: WorkflowModelUnavailableReason }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-warning">
      <HugeiconsIcon icon={Alert02Icon} className="size-3 shrink-0" />
      {formatWorkflowModelUnavailable(reason)}
    </span>
  );
}

/**
 * A model's provider logo and name. A model that is gone shows the provider's
 * own id for it (e.g. on an old run). With `flagUnavailable`, a model that
 * can't run leads with a warning, for places that pick what runs next.
 */
export function WorkflowModelName({
  modelId,
  flagUnavailable = false,
  className,
}: {
  modelId: string;
  flagUnavailable?: boolean;
  className?: string;
}) {
  const { data: model } = useQuery({
    ...listModelsQueryOptions,
    select: (models: ProviderModelInfo[]) => models.find((candidate) => candidate.id === modelId),
  });
  const getReason = useGetModelUnavailableReason();
  const reason = flagUnavailable ? (getReason?.(modelId) ?? null) : null;
  const label = model ? getModelLabel(model) : getProviderModelIdFromModelId(modelId);
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      title={!model && getReason ? "This model is no longer available" : undefined}
    >
      {reason ? <ModelUnavailableLabel reason={reason} /> : null}
      {model && !reason ? <ProviderLogo model={model} /> : null}
      <span className={cn("truncate", reason && "text-muted-foreground")}>{label}</span>
    </span>
  );
}

/** A choice that defers to someone else's model, e.g. the chat's or the workflow's. */
export interface WorkflowModelPreset {
  key: string;
  label: string;
  /** The model it resolves to right now, for display; null when unknown. */
  modelId: string | null;
}

/**
 * Picks the model a workflow step runs with: one of `presets` (inherit a
 * model from elsewhere) or a specific model. `value` is the specific model,
 * null while a preset is active.
 */
export function WorkflowModelPicker({
  value,
  presets,
  activePresetKey,
  onSelectPreset,
  onSelectModel,
  className,
  size = "sm",
}: {
  value: WorkflowModelRef | null;
  presets: readonly WorkflowModelPreset[];
  activePresetKey: string | null;
  onSelectPreset: (key: string) => void;
  onSelectModel: (value: WorkflowModelRef) => void;
  className?: string;
  size?: "xs" | "sm";
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = React.useState(false);
  const selection = useWorkflowModelSelection(value, onSelectModel);
  const { model, effort } = selection;
  const activePreset = presets.find((preset) => preset.key === activePresetKey) ?? null;
  const getReason = useGetModelUnavailableReason();
  // Whatever the step would run with: the pick, else the active preset's model.
  const shownModelId = value?.modelId ?? activePreset?.modelId ?? null;
  const unavailable = shownModelId ? (getReason?.(shownModelId) ?? null) : null;

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={size}
              className={cn(
                "max-w-full min-w-0 justify-start gap-1.5 px-2 font-normal text-foreground data-popup-open:bg-hover",
                size === "xs" ? "text-xs" : "text-[13px]",
                className,
              )}
            />
          }
        >
          {unavailable && shownModelId ? (
            <WorkflowModelName modelId={shownModelId} flagUnavailable />
          ) : model ? (
            <>
              <ProviderLogo model={model} />
              <span className="truncate">{getModelLabel(model)}</span>
              {effort ? (
                <span className="shrink-0 text-muted-foreground">
                  <EffortLabel effort={effort} />
                </span>
              ) : null}
            </>
          ) : value ? (
            // Models are still loading.
            <WorkflowModelName modelId={value.modelId} />
          ) : activePreset?.modelId ? (
            // A preset reads quieter than a pick, which is what tells them apart.
            <WorkflowModelName modelId={activePreset.modelId} className="text-muted-foreground" />
          ) : (
            <span className="truncate text-muted-foreground">{activePreset?.label ?? "Model"}</span>
          )}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            data-icon="inline-end"
            className="ml-auto shrink-0 text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-3xl max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        >
          <div role="group" aria-label="Defaults" className="border-b border-separator p-1">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                aria-pressed={preset.key === activePresetKey}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100 hover:bg-hover",
                  preset.key === activePresetKey && CURRENT_ITEM_CLASS,
                )}
                onClick={() => {
                  onSelectPreset(preset.key);
                  setIsOpen(false);
                }}
              >
                <span className="shrink-0">{preset.label}</span>
                {preset.modelId ? (
                  <WorkflowModelName
                    modelId={preset.modelId}
                    flagUnavailable
                    className="text-xs text-muted-foreground"
                  />
                ) : null}
              </button>
            ))}
          </div>
          <ModelPickerCommand
            selection={selection}
            onDone={() => setIsOpen(false)}
            onOpenLibrary={() => {
              setIsOpen(false);
              setIsLibraryOpen(true);
            }}
          />
        </PopoverContent>
      </Popover>
      <ModelLibraryDialog
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        currentModelId={model?.id ?? null}
        onUseModel={(nextModel) => selection.selectModel(nextModel)}
      />
    </>
  );
}
