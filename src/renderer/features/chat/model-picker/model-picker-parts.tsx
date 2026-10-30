import { formatForDisplay, type Hotkey } from "@tanstack/react-hotkeys";
import type { ProviderInfo, ProviderModelInfo } from "@shared/ipc";
import { formatReasoningEffort, type ReasoningEffort } from "@shared/models/reasoning";

import { Kbd } from "@/components/ui/kbd";
import { getProviderIconById } from "@/lib/provider-icons";
import { BrandIcon } from "@/lib/provider-icons/brand-icon";
import { cn } from "cn";

import { getModelLabel } from "./model-picker-data";

/**
 * Marks the item in use with a slim accent bar on its leading edge — the same
 * mark everywhere, instead of a trailing checkmark. Needs a positioned item.
 */
export const CURRENT_ITEM_CLASS =
  "relative before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary";

/** The creator's logo when the provider reports one, otherwise the provider's. */
export function ModelIcon({
  model,
  provider,
  className,
}: {
  model: ProviderModelInfo;
  provider: ProviderInfo | undefined;
  className?: string;
}) {
  if (model.creator) {
    return (
      <BrandIcon
        creator={model.creator}
        fallbackLabel={getModelLabel(model)}
        className={cn("size-4 rounded-sm text-[9px]", className)}
      />
    );
  }

  const ProviderIcon = provider ? getProviderIconById(provider.catalogId) : null;
  return ProviderIcon ? <ProviderIcon className={cn("size-4 shrink-0", className)} /> : null;
}

/**
 * Signal-style bars, one per level above "Off". Off leaves every bar empty;
 * Default draws them all half-toned — the provider decides — so the two never
 * read alike.
 */
export function EffortBars({
  effort,
  offered,
  className,
}: {
  effort: ReasoningEffort | null;
  offered: readonly ReasoningEffort[];
  className?: string;
}) {
  const levels = offered.filter((level) => level !== "none");
  const filled = effort === null || effort === "none" ? 0 : levels.indexOf(effort) + 1;

  return (
    <span aria-hidden="true" className={cn("flex h-3 items-end gap-px", className)}>
      {levels.map((level, index) => (
        <span
          key={level}
          className={cn(
            "w-0.75 rounded-full transition-colors duration-100",
            effort === null ? "bg-current/45" : index < filled ? "bg-current" : "bg-current/20",
          )}
          style={{ height: `${((index + 1) / levels.length) * 100}%` }}
        />
      ))}
    </span>
  );
}

export function EffortLabel({ effort }: { effort: ReasoningEffort | null }) {
  return <span className="tabular-nums">{formatReasoningEffort(effort)}</span>;
}

/** A run of digit shortcuts, e.g. ⌥⌘0–3, shown from its first hotkey. */
export function HotkeyRangeKbd({
  hotkey,
  to,
  className,
}: {
  hotkey: Hotkey;
  to: number;
  className?: string;
}) {
  return <Kbd className={className}>{`${formatForDisplay(hotkey)}–${to}`}</Kbd>;
}

export function HotkeyKbd({ hotkey, className }: { hotkey: Hotkey; className?: string }) {
  return <Kbd className={className}>{formatForDisplay(hotkey)}</Kbd>;
}
