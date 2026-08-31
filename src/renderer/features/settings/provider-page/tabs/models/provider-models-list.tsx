import { useCallback, useRef } from "react";
import {
  Brain02Icon,
  CodeIcon,
  Database01Icon,
  Image02Icon,
  Pdf01Icon,
  Video01Icon,
  VolumeHighIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandIcon } from "@/lib/provider-icons/brand-icon";
import { cn } from "@/lib/utils";
import type { IconSvgElement } from "@hugeicons/react";
import type { ProviderModelInfo } from "@shared/ipc";
import {
  getModelDetails,
  type ModelCapability,
  type ModelDetails,
} from "@shared/models/model-details";

export interface DecoratedModel {
  model: ProviderModelInfo;
  details: ModelDetails;
  name: string;
}

interface ProviderModelsListProps {
  models: DecoratedModel[];
  areSwitchesDisabled?: boolean;
  onModelEnabledChange?: (modelId: string, isEnabled: boolean) => void;
}

/** Rough row height, refined per row by `measureElement` once it mounts. */
const ESTIMATED_CARD_HEIGHT_PX = 150;

export function decorateModel(
  model: ProviderModelInfo,
  fallbackCreator: string | null,
): DecoratedModel {
  return {
    model,
    details: getModelDetails(model.metadata, model.providerModelId, fallbackCreator),
    name: model.displayName?.trim() || model.providerModelId,
  };
}

export function ProviderModelsList({
  models,
  areSwitchesDisabled = false,
  onModelEnabledChange,
}: ProviderModelsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT_PX,
    overscan: 6,
    getItemKey: useCallback((index: number) => models[index].model.id, [models]),
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <ProviderModelCard
              entry={models[virtualRow.index]}
              isSwitchDisabled={areSwitchesDisabled}
              onEnabledChange={onModelEnabledChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProviderModelCard({
  entry,
  isSwitchDisabled = false,
  onEnabledChange,
}: {
  entry: DecoratedModel;
  isSwitchDisabled?: boolean;
  onEnabledChange?: (modelId: string, isEnabled: boolean) => void;
}) {
  const { model, details, name } = entry;
  const facts = buildFacts(details);

  // A disabled model dims its logo and capability marks but never its text —
  // you have to be able to read a model to decide whether to turn it on.
  const isOff = !model.isEnabled;

  return (
    <div className="border-b border-separator px-1 py-4">
      <div className="flex items-start gap-3">
        <BrandIcon
          creator={details.creator}
          fallbackLabel={name}
          className={cn("mt-px size-7", isOff && "opacity-35")}
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium">{name}</span>
            {details.isFree ? (
              <Badge variant="outline" className="border-primary/40 text-primary">
                Free
              </Badge>
            ) : null}
            {model.status !== "active" ? (
              <Badge variant={model.status === "removed" ? "destructive" : "secondary"}>
                {model.status === "removed" ? "Removed" : "Deprecated"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
            {model.providerModelId}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 pt-1">
          {details.capabilities.map((capability) => (
            <CapabilityChip key={capability} capability={capability} isDimmed={isOff} />
          ))}
          <Switch
            className="ml-1.5"
            aria-label={`Toggle model ${name}`}
            disabled={isSwitchDisabled}
            checked={model.isEnabled}
            onCheckedChange={(checked) => onEnabledChange?.(model.id, checked)}
          />
        </div>
      </div>

      {details.description ? (
        <p className="mt-3 line-clamp-2 pl-10 text-[12px] leading-relaxed text-muted-foreground">
          {details.description}
        </p>
      ) : null}

      {facts.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-10 text-[11px] text-muted-foreground/80">
          {facts.map((fact, index) => (
            <span key={fact} className="flex items-center gap-2">
              {index > 0 ? <span className="text-muted-foreground/40">·</span> : null}
              {fact}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const CAPABILITY_BADGES = {
  reasoning: { icon: Brain02Icon, label: "Reasoning" },
  tools: { icon: Wrench01Icon, label: "Tool calling" },
  vision: { icon: Image02Icon, label: "Image input" },
  audio: { icon: VolumeHighIcon, label: "Audio input" },
  video: { icon: Video01Icon, label: "Video input" },
  pdf: { icon: Pdf01Icon, label: "PDF input" },
  structured: { icon: CodeIcon, label: "Structured output" },
  caching: { icon: Database01Icon, label: "Prompt caching" },
} satisfies Record<ModelCapability, { icon: IconSvgElement; label: string }>;

function CapabilityChip({
  capability,
  isDimmed,
}: {
  capability: ModelCapability;
  isDimmed: boolean;
}) {
  const { icon, label } = CAPABILITY_BADGES[capability];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={label}
            className={cn(
              "flex items-center text-muted-foreground/70",
              isDimmed && "text-muted-foreground/35",
            )}
          >
            <HugeiconsIcon icon={icon} className="size-4" />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The one-line "by x · date · context · price" strip, skipping anything unknown. */
function buildFacts(details: ModelDetails): string[] {
  const facts: string[] = [];

  if (details.creator) facts.push(`by ${details.creator}`);
  if (details.releasedAt !== null) facts.push(formatDate(details.releasedAt));
  if (details.contextLength !== null) facts.push(`${formatCompact(details.contextLength)} context`);
  if (details.maxOutputTokens !== null) {
    facts.push(`${formatCompact(details.maxOutputTokens)} max output`);
  }

  if (details.pricing) {
    const { input, output, cachedInput } = details.pricing;
    if (input !== null) facts.push(`${formatPrice(input)} input`);
    if (output !== null) facts.push(`${formatPrice(output)} output`);
    if (cachedInput !== null) facts.push(`${formatPrice(cachedInput)} cached`);
  }

  if (details.parameterSize) facts.push(`${details.parameterSize} params`);
  if (details.quantization) facts.push(details.quantization);
  if (details.fileSizeBytes !== null) facts.push(formatBytes(details.fileSizeBytes));

  return facts;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(epochMs: number): string {
  return dateFormatter.format(new Date(epochMs));
}

function formatCompact(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${trimZeros((tokens / 1_000_000).toFixed(2))}M`;
  }

  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }

  return String(tokens);
}

function formatPrice(usdPerMillionTokens: number): string {
  return `$${trimZeros(usdPerMillionTokens.toFixed(4))}/M`;
}

function formatBytes(bytes: number): string {
  return `${trimZeros((bytes / 1_000_000_000).toFixed(2))} GB`;
}

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
