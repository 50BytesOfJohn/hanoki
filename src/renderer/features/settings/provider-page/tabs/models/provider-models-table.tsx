import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ProviderModelInfo } from "@shared/ipc";

interface ProviderModelsTableProps {
  models: ProviderModelInfo[];
  areSwitchesDisabled?: boolean;
  onModelEnabledChange?: (modelId: string, isEnabled: boolean) => void;
}

const MODEL_ROW_HEIGHT_PX = 44;

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
              className="absolute left-0 top-0 grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-separator px-2 last:border-b-0"
              style={{
                height: `${MODEL_ROW_HEIGHT_PX}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <span className="min-w-0 truncate text-[13px] font-medium">{modelName}</span>
              <Badge
                variant={model.status === "removed" ? "destructive" : "secondary"}
                className={cn(model.status === "active" && "text-success")}
              >
                {formatModelStatus(model.status)}
              </Badge>
              <Switch
                aria-label={`Toggle model ${modelName}`}
                disabled={areSwitchesDisabled}
                checked={model.isEnabled}
                onCheckedChange={(checked) => onModelEnabledChange?.(model.id, checked)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
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
