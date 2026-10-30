import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { ArrowDown01Icon, DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProviderModelInfo } from "@shared/ipc";
import { getEffortForBarCount, type ReasoningEffort } from "@shared/models/reasoning";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsActiveChatPane } from "@/features/chat/chat-pane-context";
import { listEnabledModelsQueryOptions, listRecentModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";
import { cn } from "cn";

import { getModelLabel, getPinnedModels, getRecentRows } from "./model-picker-data";
import { ModelPickerCommand } from "./model-picker-command";
import { EffortControl, EffortMenuItems } from "./effort-control";
import { EFFORT_LEVEL_HOTKEYS, MODEL_PICKER_HOTKEYS } from "./model-picker-hotkeys";
import {
  CURRENT_ITEM_CLASS,
  EffortBars,
  EffortLabel,
  HotkeyKbd,
  ModelIcon,
} from "./model-picker-parts";
import { ModelLibraryDialog } from "./model-library-dialog";
import { useChatModelSelection, type ChatModelSelection } from "./use-chat-model-selection";

const COMPOSER_INPUT_SELECTOR = '[data-chat-composer-input="true"] [contenteditable="true"]';

/**
 * The composer's model and effort controls. The model button opens the picker
 * (Mod+/) and right-click on it a quick switcher; the effort button opens a
 * slider (Mod+Shift+E) and right-click on it lists every level. Mod+Alt+0–9
 * sets the effort by how many bars it lights.
 *
 * Nothing locks them: a pick made mid-reply or while editing a message applies
 * to the next request, including the one saving an edit as a new branch sends.
 */
export function ChatModelPicker() {
  const selection = useChatModelSelection();
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const isActivePane = useIsActiveChatPane();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = React.useState(false);
  const [isEffortOpen, setIsEffortOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusToEditorRef = React.useRef(false);
  // The editor typed in when a control opened: the composer or a message being edited.
  const focusedEditorRef = React.useRef<HTMLElement | null>(null);
  // The library takes focus as the picker closes; handing it back would steal it.
  const isHandingOffToLibraryRef = React.useRef(false);

  const { model, effort } = selection;
  const offered = model?.reasoningEfforts ?? [];
  const provider = providers.find((candidate) => candidate.id === model?.providerId);

  const getComposerInput = () =>
    triggerRef.current
      ?.closest("[data-chat-composer-shell]")
      ?.querySelector<HTMLElement>(COMPOSER_INPUT_SELECTOR) ?? null;

  const rememberFocusedEditor = () => {
    const active = document.activeElement;
    focusedEditorRef.current =
      active instanceof HTMLElement && active.isContentEditable ? active : null;
  };

  const getEditorToRefocus = () =>
    focusedEditorRef.current?.isConnected ? focusedEditorRef.current : getComposerInput();

  const setOpen = (open: boolean) => {
    if (open) {
      // Typing resumes where it was if the picker was summoned from an editor.
      rememberFocusedEditor();
      returnFocusToEditorRef.current = focusedEditorRef.current !== null;
    }
    setIsOpen(open);
  };

  const setEffortOpen = (open: boolean) => {
    if (open) rememberFocusedEditor();
    setIsEffortOpen(open);
  };

  const openLibrary = () => {
    isHandingOffToLibraryRef.current = isOpen;
    setIsOpen(false);
    setIsLibraryOpen(true);
  };

  const getPickerFinalFocus = () => {
    if (isHandingOffToLibraryRef.current) {
      isHandingOffToLibraryRef.current = false;
      return false;
    }

    return returnFocusToEditorRef.current ? getEditorToRefocus() : true;
  };

  useHotkey(
    MODEL_PICKER_HOTKEYS.open,
    (event) => {
      event.preventDefault();
      setOpen(!isOpen);
    },
    {
      enabled: isActivePane,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
      meta: { name: "Switch model", description: "Open the model picker" },
    },
  );

  useHotkeys(
    EFFORT_LEVEL_HOTKEYS.map((hotkey, count) => ({
      hotkey,
      callback: (event: KeyboardEvent) => {
        const next = getEffortForBarCount(count, offered);
        if (next === undefined) return;
        event.preventDefault();
        selection.setEffort(next);
      },
    })),
    {
      enabled: isActivePane && offered.length > 0,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
      meta: { name: "Set effort", description: "Light that many effort bars" },
    },
  );

  useHotkey(
    MODEL_PICKER_HOTKEYS.openEffort,
    (event) => {
      event.preventDefault();
      setIsOpen(false);
      setEffortOpen(!isEffortOpen);
    },
    {
      enabled: isActivePane && offered.length > 0,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
      meta: { name: "Effort", description: "Open the effort slider" },
    },
  );

  return (
    <>
      <div className="flex min-w-0 items-center">
        <ContextMenu>
          <ContextMenuTrigger render={<div className="flex min-w-0" />}>
            <Popover open={isOpen} onOpenChange={setOpen}>
              <Tooltip>
                <PopoverTrigger
                  render={
                    <TooltipTrigger
                      render={
                        <Button
                          ref={triggerRef}
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Model"
                          className="max-w-64 min-w-0 gap-2 px-2 text-[13px] font-normal text-foreground data-popup-open:bg-hover"
                        />
                      }
                    />
                  }
                >
                  {model ? (
                    <>
                      <ModelIcon model={model} provider={provider} />
                      <span className="truncate">{getModelLabel(model)}</span>
                    </>
                  ) : (
                    <span>Select model</span>
                  )}
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    data-icon="inline-end"
                    className="text-muted-foreground"
                  />
                </PopoverTrigger>
                <TooltipContent className="flex items-center gap-2">
                  Switch model
                  <HotkeyKbd hotkey={MODEL_PICKER_HOTKEYS.open} />
                </TooltipContent>
              </Tooltip>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-3xl max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
                finalFocus={getPickerFinalFocus}
              >
                <ModelPickerCommand
                  selection={selection}
                  onDone={() => {
                    returnFocusToEditorRef.current = true;
                    setIsOpen(false);
                  }}
                  onOpenLibrary={openLibrary}
                />
              </PopoverContent>
            </Popover>
          </ContextMenuTrigger>
          <ModelQuickMenu selection={selection} onOpenLibrary={openLibrary} />
        </ContextMenu>

        {offered.length > 0 ? (
          <EffortControl
            offered={offered}
            value={effort}
            onValueChange={selection.setEffort}
            open={isEffortOpen}
            onOpenChange={setEffortOpen}
            finalFocus={() => getEditorToRefocus() ?? true}
          />
        ) : null}
      </div>

      <ModelLibraryDialog
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        currentModelId={model?.id ?? null}
        finalFocus={() => getEditorToRefocus() ?? true}
        onUseModel={(nextModel) => selection.selectModel(nextModel)}
      />
    </>
  );
}

/** Right-click on the model: switch without searching, or change the effort. */
function ModelQuickMenu({
  selection,
  onOpenLibrary,
}: {
  selection: ChatModelSelection;
  onOpenLibrary: () => void;
}) {
  const { data: models = [] } = useQuery(listEnabledModelsQueryOptions);
  const { data: recents = [] } = useQuery(listRecentModelsQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const { model, effort } = selection;
  const offered = model?.reasoningEfforts ?? [];
  const pinned = React.useMemo(() => getPinnedModels(models), [models]);
  const recentRows = React.useMemo(() => getRecentRows(models, recents), [models, recents]);
  const providersById = React.useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  const renderModelItem = (
    key: string,
    candidate: ProviderModelInfo,
    candidateEffort: ReasoningEffort | null,
    isCurrent: boolean,
  ) => {
    const candidateOffered = candidate.reasoningEfforts ?? [];

    return (
      <ContextMenuItem
        key={key}
        className={cn("gap-2 pr-2", isCurrent && CURRENT_ITEM_CLASS)}
        onClick={() => selection.selectModel(candidate, candidateEffort)}
      >
        <ModelIcon model={candidate} provider={providersById.get(candidate.providerId)} />
        <span className="truncate">{getModelLabel(candidate)}</span>
        {candidateOffered.length > 0 && candidateEffort !== null ? (
          <ContextMenuShortcut className="flex items-center gap-1.5 tracking-normal">
            <EffortBars effort={candidateEffort} offered={candidateOffered} />
            <EffortLabel effort={candidateEffort} />
          </ContextMenuShortcut>
        ) : null}
      </ContextMenuItem>
    );
  };

  return (
    <ContextMenuContent side="top" align="start" className="w-72">
      {pinned.length > 0 ? (
        <ContextMenuGroup>
          <ContextMenuLabel>Pinned</ContextMenuLabel>
          {pinned.map((candidate) =>
            renderModelItem(
              `pinned:${candidate.id}`,
              candidate,
              selection.getEffortFor(candidate),
              candidate.id === model?.id,
            ),
          )}
        </ContextMenuGroup>
      ) : null}
      {recentRows.length > 0 ? (
        <>
          {pinned.length > 0 ? <ContextMenuSeparator /> : null}
          <ContextMenuGroup>
            <ContextMenuLabel>Recent</ContextMenuLabel>
            {recentRows.map((row) =>
              renderModelItem(
                row.key,
                row.model,
                row.effort ?? null,
                row.model.id === model?.id && (row.effort ?? null) === effort,
              ),
            )}
          </ContextMenuGroup>
        </>
      ) : null}
      {offered.length > 0 ? (
        <>
          {pinned.length > 0 || recentRows.length > 0 ? <ContextMenuSeparator /> : null}
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <EffortBars effort={effort} offered={offered} />
                Effort
                <span className="ml-auto text-muted-foreground">
                  <EffortLabel effort={effort} />
                </span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <EffortMenuItems
                  offered={offered}
                  value={effort}
                  onValueChange={selection.setEffort}
                />
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuGroup>
        </>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onClick={onOpenLibrary}>
          <HugeiconsIcon icon={DashboardSquare01Icon} />
          All models
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}
