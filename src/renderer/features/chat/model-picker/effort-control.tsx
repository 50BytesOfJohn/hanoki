import * as React from "react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import {
  formatReasoningEffort,
  getEffortBarCount,
  getEffortForBarCount,
  type ReasoningEffort,
} from "@shared/models/reasoning";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { EFFORT_LEVEL_HOTKEYS, MODEL_PICKER_HOTKEYS } from "./model-picker-hotkeys";
import { CURRENT_ITEM_CLASS, EffortBars, EffortLabel, HotkeyKbd } from "./model-picker-parts";

/** Short enough for six labels under a popover-wide slider. */
const SHORT_LABELS = {
  none: "Off",
  minimal: "Min",
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "Max",
} satisfies Record<ReasoningEffort, string>;

/** Half the slider thumb (`size-9`), which `thumbAlignment="edge"` insets by. */
const THUMB_RADIUS_PX = 18;

/**
 * A pick is shown at once and held until `value` catches up: saving goes
 * through an async mutation, so deriving the display from `value` alone
 * snaps it back to the previous level for a few frames.
 */
function usePendingEffort(value: ReasoningEffort | null, offered: readonly ReasoningEffort[]) {
  const [pendingEffort, setPendingEffort] = React.useState<ReasoningEffort | null | undefined>(
    undefined,
  );

  // Confirmed once `value` actually moves to the pick; merely matching the
  // stale value does not count, as a superseding pick can return to it while
  // the earlier save is still in flight.
  const previousValueRef = React.useRef(value);
  React.useEffect(() => {
    const valueChanged = previousValueRef.current !== value;
    previousValueRef.current = value;
    if (valueChanged && pendingEffort !== undefined && pendingEffort === value) {
      setPendingEffort(undefined);
    }
  }, [pendingEffort, value]);

  // If the save is rolled back, `value` never catches up; stop masking it.
  React.useEffect(() => {
    if (pendingEffort === undefined) return;
    const timer = window.setTimeout(() => setPendingEffort(undefined), 2000);
    return () => window.clearTimeout(timer);
  }, [pendingEffort]);

  // A pending pick for another model's stops (the model changed underneath
  // the open panel) must not park the thumb on the wrong stop.
  const pendingOffered =
    pendingEffort === undefined || pendingEffort === null || offered.includes(pendingEffort);
  const shownValue = pendingOffered && pendingEffort !== undefined ? pendingEffort : value;

  return { pendingEffort, setPendingEffort, shownValue };
}

type PendingEffortState = ReturnType<typeof usePendingEffort>;

interface EffortControlProps {
  offered: readonly ReasoningEffort[];
  /** Null is the provider default. */
  value: ReasoningEffort | null;
  onValueChange: (effort: ReasoningEffort | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes once the popover closes, typically the prompt. */
  finalFocus?: () => HTMLElement | boolean | null;
}

/**
 * The composer's effort button. Click (or Mod+Shift+E) opens a slider with
 * named stops and a Default switch; right-click lists every level.
 */
export function EffortControl({
  offered,
  value,
  onValueChange,
  open,
  onOpenChange,
  finalFocus,
}: EffortControlProps) {
  // Owned here, not in the panel, so the trigger (and a closing popover)
  // keep showing the pick while the save is still in flight.
  const pendingState = usePendingEffort(value, offered);
  const shownValue = pendingState.shownValue;

  const pickFromMenu = (effort: ReasoningEffort | null) => {
    if (effort !== shownValue) {
      pendingState.setPendingEffort(effort);
    }
    onValueChange(effort);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<span className="inline-flex" />}>
        <Popover open={open} onOpenChange={onOpenChange}>
          <Tooltip>
            <PopoverTrigger
              render={
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Effort: ${formatReasoningEffort(shownValue)}`}
                      className="gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground data-popup-open:bg-hover data-popup-open:text-foreground"
                    />
                  }
                />
              }
            >
              <EffortBars effort={shownValue} offered={offered} />
              <EffortLabel effort={shownValue} />
            </PopoverTrigger>
            <TooltipContent className="flex items-center gap-2">
              Effort
              <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.openEffort} />
            </TooltipContent>
          </Tooltip>
          <EffortPopoverContent
            offered={offered}
            value={value}
            pendingState={pendingState}
            onValueChange={onValueChange}
            onDone={() => onOpenChange(false)}
            finalFocus={finalFocus}
          />
        </Popover>
      </ContextMenuTrigger>
      <ContextMenuContent side="top" align="start" className="w-48">
        <ContextMenuGroup>
          <EffortMenuItems offered={offered} value={shownValue} onValueChange={pickFromMenu} />
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The slider panel inside a popover, focused on the thumb. Shared by the
 * composer's effort button and the picker's per-row effort.
 */
export function EffortPopoverContent({
  offered,
  value,
  pendingState: pendingStateProp,
  onValueChange,
  onDone,
  finalFocus,
  ...positioning
}: {
  offered: readonly ReasoningEffort[];
  value: ReasoningEffort | null;
  /**
   * Shared pending pick, when the caller also displays it (the composer's
   * effort button). Without it the panel keeps its own.
   */
  pendingState?: PendingEffortState;
  onValueChange: (effort: ReasoningEffort | null) => void;
  /** Enter in the panel. */
  onDone: () => void;
  finalFocus?: () => HTMLElement | boolean | null;
} & Pick<React.ComponentProps<typeof PopoverContent>, "anchor" | "side" | "align" | "sideOffset">) {
  const thumbInputRef = React.useRef<HTMLInputElement>(null);
  const internalPendingState = usePendingEffort(value, offered);
  const pendingState = pendingStateProp ?? internalPendingState;

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={8}
      {...positioning}
      className="w-80 gap-0 p-0"
      initialFocus={thumbInputRef}
      finalFocus={finalFocus}
      onKeyDown={(event) => {
        // The panel can sit inside the model picker, whose list also listens
        // for Enter and arrows; keep those keys here. Escape still reaches the
        // popover's own dismissal.
        if (event.key !== "Escape") event.stopPropagation();
      }}
    >
      <EffortPanel
        offered={offered}
        pendingState={pendingState}
        thumbInputRef={thumbInputRef}
        onValueChange={onValueChange}
        onDone={onDone}
      />
    </PopoverContent>
  );
}

function EffortPanel({
  offered,
  pendingState,
  thumbInputRef,
  onValueChange,
  onDone,
}: {
  offered: readonly ReasoningEffort[];
  pendingState: PendingEffortState;
  thumbInputRef: React.RefObject<HTMLInputElement | null>;
  onValueChange: (effort: ReasoningEffort | null) => void;
  onDone: () => void;
}) {
  const switchId = React.useId();
  const lastIndex = offered.length - 1;
  // Where the thumb rests under Default: Medium, or the middle stop.
  const parkedIndex = offered.includes("medium")
    ? offered.indexOf("medium")
    : Math.floor(lastIndex / 2);
  // Follows the thumb while dragging; the level is saved once on release.
  const [draftIndex, setDraftIndex] = React.useState<number | null>(null);
  const { setPendingEffort, shownValue } = pendingState;
  const index =
    draftIndex ?? (shownValue === null ? parkedIndex : Math.max(0, offered.indexOf(shownValue)));
  const isDefault = shownValue === null && draftIndex === null;
  const shownEffort = isDefault ? null : (offered[index] ?? null);
  const didCommitRef = React.useRef(false);
  const sliderPressRef = React.useRef(false);

  const commit = (effort: ReasoningEffort | null | undefined) => {
    setDraftIndex(null);
    // Compare with what is shown, not the stale prop: a rapid second pick
    // that returns to the saved level still has to be sent, or the earlier
    // in-flight save would win.
    if (effort === undefined || effort === shownValue) return;
    setPendingEffort(effort);
    onValueChange(effort);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const digit = /^Digit(\d)$/.exec(event.code)?.[1];
    if (digit !== undefined) {
      event.preventDefault();
      commit(getEffortForBarCount(Number(digit), offered));
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      commit(null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between">
        <output className="text-base font-semibold tabular-nums" aria-live="polite">
          {formatReasoningEffort(shownEffort)}
        </output>
        <Field orientation="horizontal" className="w-auto gap-2">
          <FieldLabel htmlFor={switchId} className="text-xs font-normal text-muted-foreground">
            Default
            <Kbd className="bg-transparent">{formatForDisplay("Backspace")}</Kbd>
          </FieldLabel>
          <Switch
            id={switchId}
            size="sm"
            checked={isDefault}
            onCheckedChange={(checked) => commit(checked ? null : offered[parkedIndex])}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Slider
            min={0}
            max={lastIndex}
            step={1}
            value={[index]}
            data-default={isDefault || undefined}
            // Under Default the thumb only marks a resting place; the fill stays empty.
            className="cursor-pointer py-1 data-default:**:data-[slot=slider-range]:opacity-0 data-default:**:data-[slot=slider-thumb]:opacity-60"
            trackClassName="data-horizontal:h-7"
            thumbClassName="size-9 cursor-grab border-border shadow-md after:-inset-1 hover:ring-4 focus-visible:ring-4 active:cursor-grabbing active:ring-4"
            thumbProps={{
              inputRef: thumbInputRef,
              getAriaLabel: () => "Effort",
              getAriaValueText: (_formatted, stop) =>
                formatReasoningEffort(isDefault ? null : (offered[stop] ?? null)),
            }}
            onPointerDown={() => {
              sliderPressRef.current = true;
              didCommitRef.current = false;
            }}
            onPointerUp={() => {
              // Only a press that started on the slider counts; a release over
              // the track after pressing elsewhere in the panel must not pick.
              if (!sliderPressRef.current) return;
              sliderPressRef.current = false;
              // A press on the parked stop changes nothing, so no commit fires;
              // under Default it still means "use this level".
              // Runs after the slider's own release handling has had its chance to commit.
              window.setTimeout(() => {
                if (!didCommitRef.current && isDefault) commit(offered[index]);
              });
            }}
            onPointerCancel={() => {
              sliderPressRef.current = false;
              setDraftIndex(null);
            }}
            onValueChange={(next) => setDraftIndex(Array.isArray(next) ? (next[0] ?? 0) : next)}
            onValueCommitted={(next) => {
              didCommitRef.current = true;
              commit(offered[Array.isArray(next) ? (next[0] ?? 0) : next]);
            }}
          />

          {/* Stop dots sit on the track; clicks pass through to the slider. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {offered.map((level, stop) => {
              if (stop === index) return null;
              const fraction = lastIndex === 0 ? 0 : stop / lastIndex;
              const isFilled = !isDefault && stop < index;

              return (
                <span
                  key={level}
                  className={cn(
                    "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                    isFilled ? "bg-primary-foreground/70" : "bg-muted-foreground/40",
                  )}
                  style={{
                    left: `calc(${THUMB_RADIUS_PX}px + (100% - ${THUMB_RADIUS_PX * 2}px) * ${fraction})`,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${offered.length}, minmax(0, 1fr))` }}
        >
          {offered.map((level, stop) => {
            const isSelected = !isDefault && stop === index;

            return (
              <button
                key={level}
                type="button"
                tabIndex={-1}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-10 items-center justify-center rounded-lg px-1 text-[13px] transition-colors duration-100 hover:bg-hover hover:text-foreground",
                  isSelected
                    ? "bg-hover font-semibold text-foreground"
                    : "font-normal text-muted-foreground",
                )}
                // Keep focus on the thumb so arrows keep working after a click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(level)}
              >
                {SHORT_LABELS[level]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Every level as plain items; the lit bars and accent mark the current one. */
export function EffortMenuItems({
  offered,
  value,
  onValueChange,
}: {
  offered: readonly ReasoningEffort[];
  value: ReasoningEffort | null;
  onValueChange: (effort: ReasoningEffort | null) => void;
}) {
  return [null, ...offered].map((level) => {
    const hotkey =
      level === null ? undefined : EFFORT_LEVEL_HOTKEYS[getEffortBarCount(level, offered)];

    return (
      <ContextMenuItem
        key={level ?? "default"}
        className={cn("gap-2", level === value && CURRENT_ITEM_CLASS)}
        onClick={() => onValueChange(level)}
      >
        <EffortBars effort={level} offered={offered} />
        <EffortLabel effort={level} />
        {hotkey ? (
          <ContextMenuShortcut>
            <HotkeyKbd hotkey={hotkey} className="bg-transparent" />
          </ContextMenuShortcut>
        ) : null}
      </ContextMenuItem>
    );
  });
}
