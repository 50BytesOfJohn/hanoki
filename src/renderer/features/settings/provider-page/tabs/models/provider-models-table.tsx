import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Chip, Switch } from "@heroui/react";
import type { ProviderModelInfo } from "@shared/ipc";

interface ProviderModelsTableProps {
  models: ProviderModelInfo[];
  areSwitchesDisabled?: boolean;
  onModelEnabledChange?: (modelId: string, isEnabled: boolean) => void;
}

const MODEL_ROW_HEIGHT_PX = 56;

export function ProviderModelsTable({
  models,
  areSwitchesDisabled = false,
  onModelEnabledChange,
}: ProviderModelsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => MODEL_ROW_HEIGHT_PX,
    overscan: 8,
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar">
      <div
        className="relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const model = models[virtualRow.index];
          const modelName = model.displayName?.trim() || model.providerModelId;

          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b px-2"
              style={{
                height: `${MODEL_ROW_HEIGHT_PX}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <span className="min-w-0 truncate font-medium">{modelName}</span>
              <Chip color={getModelStatusColor(model.status)} size="sm" variant="soft">
                {formatModelStatus(model.status)}
              </Chip>
              <Switch
                aria-label={`Toggle model ${modelName}`}
                isDisabled={areSwitchesDisabled}
                isSelected={model.isEnabled}
                onChange={(isSelected) => onModelEnabledChange?.(model.id, isSelected)}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getModelStatusColor(
  status: ProviderModelInfo["status"],
): "danger" | "default" | "success" {
  switch (status) {
    case "active":
      return "success";
    case "deprecated":
      return "default";
    case "removed":
      return "danger";
  }
}

function formatModelStatus(status: ProviderModelInfo["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "deprecated":
      return "Deprecated";
    case "removed":
      return "Removed";
  }
}
