import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import {
  Copy01Icon,
  DashboardSquare01Icon,
  PinIcon,
  PinOffIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProviderInfo } from "@shared/ipc";
import {
  formatReasoningEffort,
  getEffortBarLevels,
  getEffortForBarCount,
  stepReasoningEffort,
  type ReasoningEffort,
} from "@shared/models/reasoning";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover } from "@/components/ui/popover";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { cn } from "@/lib/utils";
import { listEnabledModelsQueryOptions, listRecentModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";

import {
  ALL_SECTION,
  buildModelPickerSections,
  getModelLabel,
  getSectionSearchRows,
  isModelPinned,
  resolveModelPickerSection,
  searchModelPickerRows,
  type ModelPickerRow,
} from "./model-picker-data";
import {
  MODEL_PICKER_HOTKEYS,
  PINNED_SLOT_HOTKEYS,
  ROW_EFFORT_HOTKEYS,
} from "./model-picker-hotkeys";
import {
  CURRENT_ITEM_CLASS,
  EffortBars,
  EffortLabel,
  HotkeyKbd,
  HotkeyRangeKbd,
  ModelIcon,
} from "./model-picker-parts";
import { useModelPickerPreferences } from "./model-picker-store";
import { ModelSectionRail, type ModelSectionRailItem } from "./model-section-rail";
import { EffortPopoverContent } from "./effort-control";
import { useModelActions } from "./use-model-actions";
import type { ChatModelSelection } from "./use-chat-model-selection";

const EMPTY_RECENTS: never[] = [];

interface ModelPickerCommandProps {
  selection: ChatModelSelection;
  onDone: () => void;
  onOpenLibrary: () => void;
}

export function ModelPickerCommand({ selection, onDone, onOpenLibrary }: ModelPickerCommandProps) {
  const { data: models = [] } = useQuery(listEnabledModelsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const { data: recents = EMPTY_RECENTS } = useQuery(listRecentModelsQueryOptions);
  const actions = useModelActions();
  const rememberedSectionId = useModelPickerPreferences((state) => state.pickerSectionId);
  const setRememberedSectionId = useModelPickerPreferences((state) => state.setPickerSectionId);
  const [search, setSearch] = React.useState("");
  // Where a search is narrowed to; every new search starts across all sections.
  const [searchSectionId, setSearchSectionId] = React.useState(ALL_SECTION.id);
  // Levels picked with ←/→ before choosing; cleared when the query changes.
  const [effortOverrides, setEffortOverrides] = React.useState<
    ReadonlyMap<string, ReasoningEffort | null>
  >(() => new Map());
  const [contextRowKey, setContextRowKey] = React.useState<string | null>(null);
  const [effortEdit, setEffortEdit] = React.useState<{
    row: ModelPickerRow;
    anchor: HTMLElement;
  } | null>(null);
  const effortEditValueRef = React.useRef<ReasoningEffort | null>(null);
  const pickerRootRef = React.useRef<HTMLDivElement>(null);

  const currentModelId = selection.model?.id ?? null;
  const isSearching = search.trim().length > 0;
  const sections = React.useMemo(
    () => buildModelPickerSections({ models, providers, recents }),
    [models, providers, recents],
  );
  const ranked = React.useMemo(
    () => (isSearching ? searchModelPickerRows({ models, providers, query: search }) : []),
    [isSearching, models, providers, search],
  );
  const railSections = React.useMemo(
    () => (isSearching ? [ALL_SECTION, ...sections] : sections),
    [isSearching, sections],
  );
  const railItems = React.useMemo<ModelSectionRailItem[]>(
    () =>
      railSections.map((section) => ({
        section,
        count: isSearching ? getSectionSearchRows(section, ranked).length : section.rows.length,
      })),
    [isSearching, railSections, ranked],
  );

  const activeSection = isSearching
    ? (railSections.find((section) => section.id === searchSectionId) ?? ALL_SECTION)
    : resolveModelPickerSection(sections, rememberedSectionId, currentModelId);
  const rows = React.useMemo(
    () => (isSearching ? getSectionSearchRows(activeSection, ranked) : activeSection.rows),
    [activeSection, isSearching, ranked],
  );
  const rowsByKey = React.useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
  const providersById = React.useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const pinnedRows = sections.find((section) => section.kind === "pinned")?.rows ?? [];
  // With a single provider account its name on every row is noise.
  const hasSeveralProviders = sections.filter((section) => section.kind === "provider").length > 1;

  const [highlightedKey, setHighlightedKey] = React.useState(() =>
    findPreferredRowKey(rows, currentModelId, selection.effort),
  );
  const highlightedRow = rowsByKey.get(highlightedKey);

  React.useEffect(() => {
    if (effortEdit && !rowsByKey.has(effortEdit.row.key)) setEffortEdit(null);
  }, [effortEdit, rowsByKey]);
  const contextRow = contextRowKey ? rowsByKey.get(contextRowKey) : undefined;

  const showSection = (sectionId: string) => {
    const section = railSections.find((candidate) => candidate.id === sectionId);
    if (!section) return;

    if (isSearching) {
      setSearchSectionId(section.id);
    } else {
      setRememberedSectionId(section.id);
    }
    const sectionRows = isSearching ? getSectionSearchRows(section, ranked) : section.rows;
    setHighlightedKey(findPreferredRowKey(sectionRows, currentModelId, selection.effort));
  };

  /** Overrides are per model, except recent pairs, which carry their own level. */
  const overrideKey = (row: ModelPickerRow) => (row.isRecent ? row.key : row.model.id);
  const getRowEffort = (row: ModelPickerRow): ReasoningEffort | null => {
    const override = effortOverrides.get(overrideKey(row));
    if (override !== undefined) return override;
    if (row.effort !== undefined) return row.effort;
    return selection.getEffortFor(row.model);
  };

  const choose = useStableCallback((row: ModelPickerRow, effort?: ReasoningEffort | null) => {
    selection.selectModel(row.model, effort === undefined ? getRowEffort(row) : effort);
    onDone();
  });

  const stepEffort = useStableCallback((row: ModelPickerRow, direction: 1 | -1) => {
    const offered = row.model.reasoningEfforts ?? [];
    if (offered.length === 0) return;

    setEffortOverrides((current) =>
      new Map(current).set(
        overrideKey(row),
        stepReasoningEffort(getRowEffort(row), offered, direction),
      ),
    );
  });

  const hideRow = (row: ModelPickerRow) => {
    if (row.isRecent) {
      actions.forgetRecent(row.model, row.effort ?? null);
    } else {
      actions.hide(row.model);
    }
  };

  const openEffortEditor = useStableCallback((row: ModelPickerRow, anchor: HTMLElement) => {
    effortEditValueRef.current = getRowEffort(row);
    setEffortEdit({ row, anchor });
  });

  const changeEffortEdit = useStableCallback((effort: ReasoningEffort | null) => {
    if (!effortEdit) return;
    const { row } = effortEdit;
    effortEditValueRef.current = effort;
    setEffortOverrides((current) => new Map(current).set(overrideKey(row), effort));
    if (row.model.id === currentModelId) {
      // Applies to the chat, and selectModel remembers it for the model.
      selection.setEffort(effort);
    } else {
      actions.rememberEffort(row.model, effort);
    }
  });

  const finishEffortEdit = useStableCallback(() => {
    if (!effortEdit) return;
    const { row } = effortEdit;
    const effort = effortEditValueRef.current;
    setEffortEdit(null);
    choose(row, effort);
  });

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // The effort popover is portaled outside this DOM but its keys still
    // bubble here through React; they are not picker keys.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    const nativeEvent = event.nativeEvent;

    if (event.key === "Escape" && search) {
      // First Escape clears the query; the next one closes the picker.
      event.preventDefault();
      event.stopPropagation();
      setSearch("");
      return;
    }

    if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const index = railSections.findIndex((section) => section.id === activeSection.id);
      const step = event.shiftKey ? -1 : 1;
      const next = railSections[(index + step + railSections.length) % railSections.length];
      if (next) showSection(next.id);
      return;
    }

    if (matchesKeyboardEvent(nativeEvent, MODEL_PICKER_HOTKEYS.openLibrary)) {
      event.preventDefault();
      onOpenLibrary();
      return;
    }

    if (matchesKeyboardEvent(nativeEvent, MODEL_PICKER_HOTKEYS.editRowEffort)) {
      if (highlightedRow && (highlightedRow.model.reasoningEfforts?.length ?? 0) > 0) {
        event.preventDefault();
        const anchor = pickerRootRef.current?.querySelector<HTMLElement>(
          `[data-row-key="${CSS.escape(highlightedRow.key)}"] [data-effort-trigger]`,
        );
        if (anchor) openEffortEditor(highlightedRow, anchor);
      }
      return;
    }

    const slot = PINNED_SLOT_HOTKEYS.findIndex((hotkey) =>
      matchesKeyboardEvent(nativeEvent, hotkey),
    );
    if (slot !== -1) {
      const row = pinnedRows[slot];
      if (row) {
        event.preventDefault();
        choose(row);
      }
      return;
    }

    if (!highlightedRow) return;

    const barCount = ROW_EFFORT_HOTKEYS.findIndex((hotkey) =>
      matchesKeyboardEvent(nativeEvent, hotkey),
    );
    if (barCount !== -1) {
      const level = getEffortForBarCount(barCount, highlightedRow.model.reasoningEfforts ?? []);
      if (level !== undefined) {
        event.preventDefault();
        setEffortOverrides((current) => new Map(current).set(overrideKey(highlightedRow), level));
      }
      return;
    }

    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      (highlightedRow.model.reasoningEfforts?.length ?? 0) > 0
    ) {
      event.preventDefault();
      stepEffort(highlightedRow, event.key === "ArrowRight" ? 1 : -1);
    } else if (matchesKeyboardEvent(nativeEvent, MODEL_PICKER_HOTKEYS.togglePin)) {
      event.preventDefault();
      actions.togglePinned(highlightedRow.model);
    } else if (matchesKeyboardEvent(nativeEvent, MODEL_PICKER_HOTKEYS.hide)) {
      event.preventDefault();
      hideRow(highlightedRow);
    }
  };

  return (
    <div ref={pickerRootRef} className="contents">
      <Command
        label="Models"
        shouldFilter={false}
        vimBindings={false}
        loop
        value={highlightedKey}
        onValueChange={setHighlightedKey}
        onKeyDown={handleKeyDown}
        // A fixed height keeps the panes still while switching sections.
        className="h-[min(30rem,60vh)] rounded-none! bg-transparent p-0"
      >
        <div className="border-b border-separator p-1">
          <CommandInput
            autoFocus
            value={search}
            placeholder="Search models…"
            onValueChange={(value) => {
              if (!isSearching && value.trim()) {
                setSearchSectionId(ALL_SECTION.id);
              }
              setSearch(value);
              setEffortOverrides(new Map());
            }}
          />
        </div>

        <div className="flex min-h-0 flex-1">
          <ModelSectionRail
            items={railItems}
            value={activeSection.id}
            onValueChange={showSection}
            className="w-48 shrink-0 border-r border-separator"
          />

          <ContextMenu
            onOpenChange={(open) => {
              if (!open) setContextRowKey(null);
            }}
          >
            <ContextMenuTrigger
              render={
                <CommandList
                  aria-label={activeSection.label}
                  className="max-h-none min-w-0 flex-1 scroll-py-1.5 p-1.5"
                />
              }
              onContextMenu={(event) => {
                const key =
                  event.target instanceof Element
                    ? event.target.closest("[data-row-key]")?.getAttribute("data-row-key")
                    : null;
                if (!key) {
                  event.preventDefault();
                  return;
                }
                setContextRowKey(key);
                setHighlightedKey(key);
              }}
            >
              <CommandEmpty>No models found</CommandEmpty>
              <CommandGroup className="p-0">
                {rows.map((row, index) => (
                  <ModelPickerItem
                    key={row.key}
                    row={row}
                    showProvider={row.showProvider && hasSeveralProviders}
                    provider={providersById.get(row.model.providerId)}
                    effort={getRowEffort(row)}
                    isEffortOwn={
                      row.effort !== undefined ||
                      row.model.rememberedEffort !== undefined ||
                      effortOverrides.has(overrideKey(row)) ||
                      row.model.id === currentModelId
                    }
                    isCurrent={
                      row.model.id === currentModelId &&
                      (!row.isRecent || (row.effort ?? null) === selection.effort)
                    }
                    pinHotkey={
                      activeSection.kind === "pinned" && !isSearching
                        ? PINNED_SLOT_HOTKEYS[index]
                        : undefined
                    }
                    onChoose={choose}
                    onEditEffort={openEffortEditor}
                  />
                ))}
              </CommandGroup>
            </ContextMenuTrigger>
            {contextRow ? (
              <ModelRowContextMenu
                row={contextRow}
                effort={getRowEffort(contextRow)}
                onChoose={choose}
                onTogglePin={() => actions.togglePinned(contextRow.model)}
                onHide={() => actions.hide(contextRow.model)}
                onForgetRecent={
                  contextRow.isRecent
                    ? () => actions.forgetRecent(contextRow.model, contextRow.effort ?? null)
                    : undefined
                }
              />
            ) : null}
          </ContextMenu>
        </div>

        <PickerFooter row={highlightedRow} onOpenLibrary={onOpenLibrary} />
      </Command>

      <Popover
        open={effortEdit !== null}
        onOpenChange={(open) => {
          if (!open) setEffortEdit(null);
        }}
      >
        {effortEdit ? (
          <EffortPopoverContent
            anchor={effortEdit.anchor}
            side="top"
            align="end"
            offered={effortEdit.row.model.reasoningEfforts ?? []}
            value={getRowEffort(effortEdit.row)}
            onValueChange={changeEffortEdit}
            onDone={finishEffortEdit}
            finalFocus={() =>
              pickerRootRef.current?.querySelector<HTMLElement>('[data-slot="command-input"]') ??
              true
            }
          />
        ) : null}
      </Popover>
    </div>
  );
}

/** Highlights the model in use when the section has it, else the first row. */
function findPreferredRowKey(
  rows: readonly ModelPickerRow[],
  modelId: string | null,
  effort: ReasoningEffort | null,
) {
  const matches = rows.filter((row) => row.model.id === modelId);

  return (
    matches.find((row) => !row.isRecent || (row.effort ?? null) === effort)?.key ??
    rows[0]?.key ??
    ""
  );
}

interface ModelPickerItemProps {
  row: ModelPickerRow;
  showProvider: boolean;
  provider: ProviderInfo | undefined;
  effort: ReasoningEffort | null;
  /** False when the level is only carried over, so it shows on the highlighted row alone. */
  isEffortOwn: boolean;
  isCurrent: boolean;
  pinHotkey: (typeof PINNED_SLOT_HOTKEYS)[number] | undefined;
  onChoose: (row: ModelPickerRow, effort?: ReasoningEffort | null) => void;
  onEditEffort: (row: ModelPickerRow, anchor: HTMLElement) => void;
}

const ModelPickerItem = React.memo(function ModelPickerItem({
  row,
  showProvider,
  provider,
  effort,
  isEffortOwn,
  isCurrent,
  pinHotkey,
  onChoose,
  onEditEffort,
}: ModelPickerItemProps) {
  const { model } = row;
  const offered = model.reasoningEfforts ?? [];

  return (
    <CommandItem
      value={row.key}
      data-row-key={row.key}
      onSelect={() => onChoose(row)}
      className={cn("h-9 gap-2.5 px-2", isCurrent && CURRENT_ITEM_CLASS)}
    >
      <ModelIcon model={model} provider={provider} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate">{getModelLabel(model)}</span>
        {showProvider && provider ? (
          <span className="min-w-12 shrink-[4] truncate text-xs text-muted-foreground">
            {provider.displayName}
          </span>
        ) : null}
      </span>

      {offered.length > 0 ? (
        <button
          type="button"
          tabIndex={-1}
          data-effort-trigger
          aria-label={`Effort: ${formatReasoningEffort(effort)}. Open effort slider`}
          title="Set effort"
          className={cn(
            "-my-0.5 flex w-20 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs text-muted-foreground group-data-selected/command-item:text-foreground hover:bg-foreground/10 hover:text-foreground",
            // Quiet levels (Default, or merely carried over) show on the highlighted row only.
            (!isEffortOwn || effort === null) &&
              "invisible group-data-selected/command-item:visible",
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onEditEffort(row, event.currentTarget);
          }}
        >
          <EffortBars effort={effort} offered={offered} />
          <EffortLabel effort={effort} />
        </button>
      ) : null}
      {pinHotkey ? <HotkeyKbd hotkey={pinHotkey} className="bg-transparent" /> : null}
    </CommandItem>
  );
});

function ModelRowContextMenu({
  row,
  effort,
  onChoose,
  onTogglePin,
  onHide,
  onForgetRecent,
}: {
  row: ModelPickerRow;
  effort: ReasoningEffort | null;
  onChoose: (row: ModelPickerRow, effort?: ReasoningEffort | null) => void;
  onTogglePin: () => void;
  onHide: () => void;
  onForgetRecent: (() => void) | undefined;
}) {
  const offered = row.model.reasoningEfforts ?? [];
  const pinned = isModelPinned(row.model);

  return (
    <ContextMenuContent className="min-w-52">
      {offered.length > 0 ? (
        <>
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Use with effort</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {/* Lit bars already say which level is set; no radio checks. */}
                {[null, ...offered].map((level) => (
                  <ContextMenuItem
                    key={level ?? "default"}
                    className={cn("gap-2", level === effort && CURRENT_ITEM_CLASS)}
                    onClick={() => onChoose(row, level)}
                  >
                    <EffortBars effort={level} offered={offered} />
                    {formatReasoningEffort(level)}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuGroup>
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuGroup>
        <ContextMenuItem onClick={onTogglePin}>
          <HugeiconsIcon icon={pinned ? PinOffIcon : PinIcon} />
          {pinned ? "Unpin" : "Pin"}
          <ContextMenuShortcut>
            <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.togglePin} className="bg-transparent" />
          </ContextMenuShortcut>
        </ContextMenuItem>
        {onForgetRecent ? (
          <ContextMenuItem onClick={onForgetRecent}>
            <HugeiconsIcon icon={ViewOffIcon} />
            Remove from recent
            <ContextMenuShortcut>
              <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.hide} className="bg-transparent" />
            </ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={onHide}>
          <HugeiconsIcon icon={ViewOffIcon} />
          Hide model
          {onForgetRecent ? null : (
            <ContextMenuShortcut>
              <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.hide} className="bg-transparent" />
            </ContextMenuShortcut>
          )}
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          onClick={() => void navigator.clipboard.writeText(row.model.providerModelId)}
        >
          <HugeiconsIcon icon={Copy01Icon} />
          Copy model ID
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}

function PickerFooter({
  row,
  onOpenLibrary,
}: {
  row: ModelPickerRow | undefined;
  onOpenLibrary: () => void;
}) {
  const offersEffort = (row?.model.reasoningEfforts?.length ?? 0) > 0;

  return (
    <div className="flex h-9 items-center gap-3 border-t border-separator px-1.5 text-xs text-muted-foreground">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={onOpenLibrary}
      >
        <HugeiconsIcon icon={DashboardSquare01Icon} data-icon="inline-start" />
        All models
        <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.openLibrary} className="bg-transparent" />
      </Button>

      <div className="ml-auto flex items-center gap-3 pr-1">
        <span className="flex items-center gap-1.5">
          <Kbd>⇥</Kbd>
          Section
        </span>
        {offersEffort ? (
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
            </KbdGroup>
            <HotkeyRangeKbd
              hotkey={ROW_EFFORT_HOTKEYS[0]}
              to={getEffortBarLevels(row?.model.reasoningEfforts ?? []).length}
            />
            <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.editRowEffort} />
            Effort
          </span>
        ) : null}
        {row ? (
          <span className="flex items-center gap-1.5">
            <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.togglePin} />
            {isModelPinned(row.model) ? "Unpin" : "Pin"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
