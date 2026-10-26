import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProviderInfo, ProviderModelInfo } from "@shared/ipc";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { getProviderIconById } from "@/lib/provider-icons";
import { cn } from "@/lib/utils";
import { useSetProviderModelsEnabled } from "@/mutations/models";
import { listModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";

import {
  ALL_SECTION,
  compareModelsByLabel,
  getModelLabel,
  getPinnedModels,
  isModelPinned,
  searchModelPickerRows,
  type ModelPickerSection,
} from "./model-picker-data";
import { MODEL_PICKER_HOTKEYS } from "./model-picker-hotkeys";
import { CURRENT_ITEM_CLASS, EffortBars, HotkeyKbd, ModelIcon } from "./model-picker-parts";
import { useModelPickerPreferences } from "./model-picker-store";
import { ModelSectionRail, type ModelSectionRailItem } from "./model-section-rail";
import { useModelActions } from "./use-model-actions";

type LibraryFilter = "all" | "enabled" | "disabled";

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

const USE_HOTKEY = "Mod+Enter";
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 44;

type LibraryEntry =
  | { kind: "provider"; key: string; provider: ProviderInfo }
  | {
      kind: "model";
      key: string;
      model: ProviderModelInfo;
      provider: ProviderInfo;
      showProvider: boolean;
    };

const contextFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

interface ModelLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentModelId: string | null;
  /** Switches the chat to the model; the library enables it first if needed. */
  onUseModel: (model: ProviderModelInfo) => void;
  /** Where focus lands once the library closes. */
  finalFocus?: DialogContentProps["finalFocus"];
}

type DialogContentProps = React.ComponentProps<typeof DialogContent>;

/**
 * Every model of every provider, including the ones hidden from the picker.
 * Kept out of the picker itself so the everyday list stays short.
 */
export function ModelLibraryDialog({
  open,
  onOpenChange,
  finalFocus,
  ...props
}: ModelLibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        finalFocus={finalFocus}
        className="flex h-[min(42rem,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogTitle className="sr-only">Models</DialogTitle>
        <DialogDescription className="sr-only">
          Enable, hide and pin models for the model picker.
        </DialogDescription>
        {/* Mounted only while open so every visit starts from a clean search. */}
        {open ? <ModelLibrary {...props} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ModelLibrary({
  currentModelId,
  onUseModel,
  onClose,
}: Omit<ModelLibraryDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const { data: models = [], isPending } = useQuery(listModelsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const actions = useModelActions();
  const { mutate: setProviderModelsEnabled } = useSetProviderModelsEnabled();
  const rememberedSectionId = useModelPickerPreferences((state) => state.librarySectionId);
  const setRememberedSectionId = useModelPickerPreferences((state) => state.setLibrarySectionId);
  const [search, setSearch] = React.useState("");
  // Every new search starts across all sections, like the picker.
  const [searchSectionId, setSearchSectionId] = React.useState(ALL_SECTION.id);
  const [filter, setFilter] = React.useState<LibraryFilter>("all");
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const isSearching = search.trim().length > 0;
  const visibleModels = React.useMemo(
    () => filterLibraryModels({ models, providers, search, filter }),
    [filter, models, providers, search],
  );
  const sections = React.useMemo(
    () => buildLibrarySections(models, providers),
    [models, providers],
  );
  const railItems = React.useMemo<ModelSectionRailItem[]>(
    () =>
      sections.map((section) => ({
        section,
        count: visibleModels.filter((model) => isInLibrarySection(model, section)).length,
      })),
    [sections, visibleModels],
  );
  const activeSection =
    sections.find(
      (section) => section.id === (isSearching ? searchSectionId : rememberedSectionId),
    ) ?? ALL_SECTION;
  const entries = React.useMemo(
    () => buildLibraryEntries({ models: visibleModels, providers, section: activeSection }),
    [activeSection, providers, visibleModels],
  );
  const modelEntries = React.useMemo(
    () => entries.filter((entry) => entry.kind === "model"),
    [entries],
  );
  const activeEntry =
    modelEntries.find((entry) => entry.key === activeKey) ?? modelEntries[0] ?? null;

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (entries[index]?.kind === "provider" ? HEADER_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => entries[index]?.key ?? index,
    overscan: 10,
  });

  const showSection = (sectionId: string) => {
    if (isSearching) {
      setSearchSectionId(sectionId);
    } else {
      setRememberedSectionId(sectionId);
    }
    setActiveKey(null);
    virtualizer.scrollToOffset(0);
  };

  const moveActive = (direction: 1 | -1) => {
    if (modelEntries.length === 0) return;
    const index = activeEntry ? modelEntries.indexOf(activeEntry) : -1;
    const next =
      modelEntries[(index + direction + modelEntries.length) % modelEntries.length] ?? null;
    if (!next) return;
    setActiveKey(next.key);
    virtualizer.scrollToIndex(entries.indexOf(next), { align: "auto" });
  };

  const useModel = useStableCallback((model: ProviderModelInfo) => {
    if (!model.isEnabled) {
      actions.setEnabled(model, true);
    }
    onUseModel(model);
    onClose();
  });
  const toggleEnabled = useStableCallback((model: ProviderModelInfo) =>
    actions.setEnabled(model, !model.isEnabled),
  );
  const togglePinned = useStableCallback((model: ProviderModelInfo) => actions.togglePinned(model));
  const activate = useStableCallback((key: string) => setActiveKey(key));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent;

    if (event.key === "Escape" && search) {
      event.preventDefault();
      event.stopPropagation();
      setSearch("");
    } else if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const index = sections.findIndex((section) => section.id === activeSection.id);
      const step = event.shiftKey ? -1 : 1;
      const next = sections[(index + step + sections.length) % sections.length];
      if (next) showSection(next.id);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (!activeEntry) {
      return;
    } else if (matchesKeyboardEvent(nativeEvent, USE_HOTKEY)) {
      event.preventDefault();
      useModel(activeEntry.model);
    } else if (event.key === "Enter") {
      event.preventDefault();
      toggleEnabled(activeEntry.model);
    } else if (matchesKeyboardEvent(nativeEvent, MODEL_PICKER_HOTKEYS.togglePin)) {
      event.preventDefault();
      togglePinned(activeEntry.model);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-separator p-2">
        <InputGroup className="h-8 flex-1 border-transparent bg-transparent shadow-none dark:bg-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          <InputGroupAddon>
            <HugeiconsIcon icon={SearchIcon} />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            value={search}
            placeholder="Search models…"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={activeEntry ? `${listId}-${activeEntry.key}` : undefined}
            onChange={(event) => {
              if (!isSearching && event.target.value.trim()) {
                setSearchSectionId(ALL_SECTION.id);
              }
              setSearch(event.target.value);
              setActiveKey(null);
              virtualizer.scrollToOffset(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </InputGroup>
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[filter]}
          onValueChange={(value: string[]) => {
            const next = FILTERS.find((item) => item.value === value[0])?.value;
            if (next) {
              setFilter(next);
              setActiveKey(null);
              virtualizer.scrollToOffset(0);
            }
          }}
        >
          {FILTERS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value} className="px-2.5 text-xs">
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex min-h-0 flex-1">
        <ModelSectionRail
          items={railItems}
          value={activeSection.id}
          onValueChange={showSection}
          renderItemMenu={(item) =>
            item.section.provider ? (
              <ProviderBulkMenu
                models={models.filter((model) => model.providerId === item.section.provider?.id)}
                onSetAllEnabled={(isEnabled) =>
                  setProviderModelsEnabled({
                    providerId: item.section.provider?.id ?? "",
                    isEnabled,
                  })
                }
              />
            ) : null
          }
          className="w-56 shrink-0 border-r border-separator"
        />
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar">
          {entries.length === 0 && !isPending ? (
            <Empty className="h-full">
              <EmptyDescription>No models found</EmptyDescription>
            </Empty>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label="Models"
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index];
                if (!entry) return null;

                return (
                  <div
                    key={virtualRow.key}
                    className="absolute top-0 left-0 w-full px-2"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {entry.kind === "provider" ? (
                      <ProviderHeader provider={entry.provider} />
                    ) : (
                      <LibraryModelRow
                        id={`${listId}-${entry.key}`}
                        entryKey={entry.key}
                        model={entry.model}
                        provider={entry.provider}
                        showProvider={entry.showProvider}
                        isActive={entry.key === activeEntry?.key}
                        isCurrent={entry.model.id === currentModelId}
                        onActivate={activate}
                        onToggleEnabled={toggleEnabled}
                        onTogglePinned={togglePinned}
                        onUse={useModel}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex h-9 items-center justify-end gap-3 border-t border-separator px-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>⇥</Kbd>
          Section
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          {activeEntry?.model.isEnabled ? "Disable" : "Enable"}
        </span>
        <span className="flex items-center gap-1.5">
          <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.togglePin} />
          {activeEntry && isModelPinned(activeEntry.model) ? "Unpin" : "Pin"}
        </span>
        <span className="flex items-center gap-1.5">
          <HotkeyKbd hotkey={USE_HOTKEY} />
          Use
        </span>
      </div>
    </>
  );
}

function filterLibraryModels({
  models,
  providers,
  search,
  filter,
}: {
  models: readonly ProviderModelInfo[];
  providers: readonly ProviderInfo[];
  search: string;
  filter: LibraryFilter;
}): ProviderModelInfo[] {
  const filtered = models.filter((model) => {
    switch (filter) {
      case "enabled":
        return model.isEnabled;
      case "disabled":
        return !model.isEnabled;
      case "all":
        return true;
    }
  });
  if (!search.trim()) {
    return filtered;
  }

  const matches = new Set(
    searchModelPickerRows({ models: filtered, providers, query: search }).map(
      (row) => row.model.id,
    ),
  );
  return filtered.filter((model) => matches.has(model.id));
}

type LibrarySection = Pick<ModelPickerSection, "id" | "kind" | "label" | "provider">;

/** All, Pinned when anything is pinned, then one section per provider account. */
function buildLibrarySections(
  models: readonly ProviderModelInfo[],
  providers: readonly ProviderInfo[],
): LibrarySection[] {
  const sections: LibrarySection[] = [ALL_SECTION];
  if (models.some(isModelPinned)) {
    sections.push({ id: "pinned", kind: "pinned", label: "Pinned" });
  }
  for (const provider of providers) {
    if (models.some((model) => model.providerId === provider.id)) {
      sections.push({
        id: `provider:${provider.id}`,
        kind: "provider",
        label: provider.displayName,
        provider,
      });
    }
  }
  return sections;
}

function isInLibrarySection(model: ProviderModelInfo, section: LibrarySection) {
  switch (section.kind) {
    case "pinned":
      return isModelPinned(model);
    case "provider":
      return model.providerId === section.provider?.id;
    default:
      return true;
  }
}

/** "All" keeps provider headings; a single section is a plain list. */
function buildLibraryEntries({
  models,
  providers,
  section,
}: {
  models: readonly ProviderModelInfo[];
  providers: readonly ProviderInfo[];
  section: LibrarySection;
}): LibraryEntry[] {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const toEntry = (model: ProviderModelInfo, showProvider: boolean): LibraryEntry[] => {
    const provider = providersById.get(model.providerId);
    return provider ? [{ kind: "model", key: model.id, model, provider, showProvider }] : [];
  };

  if (section.kind === "pinned") {
    return getPinnedModels(models).flatMap((model) => toEntry(model, true));
  }

  if (section.kind === "provider") {
    return models
      .filter((model) => model.providerId === section.provider?.id)
      .sort(compareModelsByLabel)
      .flatMap((model) => toEntry(model, false));
  }

  const entries: LibraryEntry[] = [];
  for (const provider of providers) {
    const providerModels = models
      .filter((model) => model.providerId === provider.id)
      .sort(compareModelsByLabel);
    if (providerModels.length === 0) continue;

    entries.push({ kind: "provider", key: `provider:${provider.id}`, provider });
    entries.push(...providerModels.flatMap((model) => toEntry(model, false)));
  }
  return entries;
}

/** Heading inside "All"; the rail entry carries the counts and bulk actions. */
function ProviderHeader({ provider }: { provider: ProviderInfo }) {
  const ProviderIcon = getProviderIconById(provider.catalogId);

  return (
    <div className="flex h-full items-end gap-2 px-2 pb-1.5 text-xs font-medium text-muted-foreground">
      <ProviderIcon className="size-3.5" />
      {provider.displayName}
    </div>
  );
}

function ProviderBulkMenu({
  models,
  onSetAllEnabled,
}: {
  models: readonly ProviderModelInfo[];
  onSetAllEnabled: (isEnabled: boolean) => void;
}) {
  const enabledCount = models.filter((model) => model.isEnabled).length;

  return (
    <ContextMenuContent>
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={enabledCount === models.length}
          onClick={() => onSetAllEnabled(true)}
        >
          <HugeiconsIcon icon={ViewIcon} />
          Enable all
        </ContextMenuItem>
        <ContextMenuItem disabled={enabledCount === 0} onClick={() => onSetAllEnabled(false)}>
          <HugeiconsIcon icon={ViewOffIcon} />
          Disable all
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}

interface LibraryModelRowProps {
  id: string;
  entryKey: string;
  model: ProviderModelInfo;
  provider: ProviderInfo;
  showProvider: boolean;
  isActive: boolean;
  isCurrent: boolean;
  onActivate: (key: string) => void;
  onToggleEnabled: (model: ProviderModelInfo) => void;
  onTogglePinned: (model: ProviderModelInfo) => void;
  onUse: (model: ProviderModelInfo) => void;
}

const LibraryModelRow = React.memo(function LibraryModelRow({
  id,
  entryKey,
  model,
  provider,
  showProvider,
  isActive,
  isCurrent,
  onActivate,
  onToggleEnabled,
  onTogglePinned,
  onUse,
}: LibraryModelRowProps) {
  const pinned = isModelPinned(model);
  const offered = model.reasoningEfforts ?? [];
  const label = getModelLabel(model);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        id={id}
        role="option"
        aria-selected={isActive}
        data-active={isActive || undefined}
        aria-current={isCurrent || undefined}
        className={cn(
          "group/library-row flex h-full items-center gap-3 rounded-md px-2 data-active:bg-hover",
          isCurrent && CURRENT_ITEM_CLASS,
        )}
        onPointerMove={() => {
          if (!isActive) onActivate(entryKey);
        }}
        onContextMenu={() => onActivate(entryKey)}
        onDoubleClick={() => onUse(model)}
      >
        <ModelIcon
          model={model}
          provider={provider}
          className={cn("size-5", !model.isEnabled && "opacity-40")}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate", !model.isEnabled && "text-muted-foreground")}>
              {label}
            </span>
            {showProvider ? (
              <span className="shrink-[4] truncate text-xs text-muted-foreground">
                {provider.displayName}
              </span>
            ) : null}
          </span>
          {label !== model.providerModelId ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {model.providerModelId}
            </span>
          ) : null}
        </div>

        {offered.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={<span className="flex h-full items-center text-muted-foreground" />}
            >
              <EffortBars effort={offered.at(-1) ?? null} offered={offered} />
            </TooltipTrigger>
            <TooltipContent>Reasoning</TooltipContent>
          </Tooltip>
        ) : null}
        {model.contextLength ? (
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {contextFormatter.format(model.contextLength)}
          </span>
        ) : (
          <span className="w-12 shrink-0" />
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                tabIndex={-1}
                aria-label={pinned ? "Unpin" : "Pin"}
                aria-pressed={pinned}
                className={cn(
                  "text-muted-foreground",
                  !pinned && "opacity-0 group-data-active/library-row:opacity-100",
                  pinned && "text-foreground",
                )}
                onClick={() => onTogglePinned(model)}
              />
            }
          >
            <HugeiconsIcon icon={PinIcon} />
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            {pinned ? "Unpin" : "Pin"}
            <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.togglePin} />
          </TooltipContent>
        </Tooltip>
        <Switch
          size="sm"
          tabIndex={-1}
          aria-label={model.isEnabled ? `Disable ${label}` : `Enable ${label}`}
          checked={model.isEnabled}
          onCheckedChange={() => onToggleEnabled(model)}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => onUse(model)}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} />
            Use in this chat
            <ContextMenuShortcut>
              <HotkeyKbd hotkey={USE_HOTKEY} className="bg-transparent" />
            </ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onTogglePinned(model)}>
            <HugeiconsIcon icon={pinned ? PinOffIcon : PinIcon} />
            {pinned ? "Unpin" : "Pin"}
            <ContextMenuShortcut>
              <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.togglePin} className="bg-transparent" />
            </ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onToggleEnabled(model)}>
            <HugeiconsIcon icon={model.isEnabled ? ViewOffIcon : ViewIcon} />
            {model.isEnabled ? "Disable" : "Enable"}
            <ContextMenuShortcut>
              <Kbd className="bg-transparent">↵</Kbd>
            </ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => void navigator.clipboard.writeText(model.providerModelId)}
          >
            <HugeiconsIcon icon={Copy01Icon} />
            Copy model ID
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
});
