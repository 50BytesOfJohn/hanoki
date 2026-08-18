import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  AiBeautifyIcon,
  ArrowDown03Icon,
  ArrowUp03Icon,
  Cancel01Icon,
  Chatting01Icon,
  Menu01Icon,
  PinIcon,
  SlidersHorizontalIcon,
  WorkflowSquare03Icon,
} from "@hugeicons/core-free-icons";

import { WindowChrome } from "@/components/app/window-chrome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toastManager } from "@/components/ui/toast";
import { ChatSidebarProvider } from "@/features/chat/chat-sidebar";
import { ChatSidebarTree } from "@/features/chat/chat-sidebar-tree";
import {
  ChatScrollActionsProvider,
  useChatScrollActions,
} from "@/features/chat/chat-scroll-actions-context";
import { ChatToolbar } from "@/features/chat/chat-toolbar";
import { ChatViewHotkeys } from "@/features/chat/chat-view-hotkeys";
import { getChatQueryOptions } from "@/queries/chats";
import { getItemQueryOptions } from "@/queries/items";
import { TerminalPane } from "@/features/terminal/terminal-pane";
import { sumiSettingsQueryOptions } from "@/queries/settings";
import { useOpenChatView } from "@/features/chat/use-chat-view";
import { useWorkspaceStore } from "@/features/workspace/store";
import { cn } from "@/lib/utils";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";
import type {
  ItemLayoutNode,
  ItemPaneState,
  ChatPaneView,
  ItemType,
  TabStateItem,
} from "@shared/ipc";
import { findPaneByItemId, type PaneDropPosition } from "@/features/workspace/store/layout-tree";
import { CHAT_DRAG_FORMAT } from "./chat-tabs";
import { PaneDropOverlay, type PaneDropIntent } from "./chat-pane-drop-overlay";
import { ChatNewTabPage } from "./chat-new-tab-page";
import { ChatPaneProvider } from "./chat-pane-context";
import { ActiveChatView } from "./chat-page";
import { ChatGraphPage } from "./modules/graph/chat-graph-page";
import { PinnedBranchesPage } from "./modules/pinned-branches/pinned-branches-page";
import { ChatSettingsPage } from "./chat-settings-page";
import { generateSumiChatTitle } from "./sumi-title-generation";

export type NativeChatDrag =
  | { kind: "unsupported" }
  | { kind: "item"; itemId: string; itemType: ItemType };

// Reads the sidebar's drag payload at `dragstart`, while the DataTransfer is still readable.
// A folder-only drag carries the format with an empty chat list — panes can't host folders, so
// it gets a "not here" overlay instead of drop zones.
function readChatDrag(event: DragEvent): NativeChatDrag | null {
  const data = event.dataTransfer;
  if (!data?.types.includes(CHAT_DRAG_FORMAT)) return null;
  let draggedItems: Array<{ id: string; type: ItemType }> = [];
  try {
    const parsed = JSON.parse(data.getData(CHAT_DRAG_FORMAT) || "[]") as unknown[];
    draggedItems = parsed.flatMap((entry) => {
      if (typeof entry === "string") return [{ id: entry, type: "chat" as const }];
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      return typeof item.id === "string" && (item.type === "chat" || item.type === "terminal")
        ? [{ id: item.id, type: item.type }]
        : [];
    });
  } catch {
    draggedItems = [];
  }
  const item = draggedItems[0];
  return item ? { kind: "item", itemId: item.id, itemType: item.type } : { kind: "unsupported" };
}

export function ChatLayout() {
  return (
    <ChatSidebarProvider className="h-full min-h-0 w-full">
      <WindowChrome contentClassName="overflow-hidden" toolbar={<ChatToolbar />}>
        <ChatLayoutFrame />
      </WindowChrome>
    </ChatSidebarProvider>
  );
}

function ChatLayoutFrame() {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const movePane = useWorkspaceStore((state) => state.movePane);
  const [draggedPaneId, setDraggedPaneId] = React.useState<string | null>(null);
  const [nativeDrag, setNativeDrag] = React.useState<NativeChatDrag | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Sidebar chats use native HTML5 drag, which dnd-kit does not participate in.
  // `dragstart` must be observed while bubbling — the source sets the chat payload in
  // its own handler, so a capture listener would still see an empty dataTransfer.
  // `dragend`/`drop` reset in capture, since the drop handler stops propagation and the
  // drag source can re-render before its bubbling `dragend` is delivered.
  React.useEffect(() => {
    const onStart = (event: DragEvent) => setNativeDrag(readChatDrag(event));
    const onStop = () => setNativeDrag(null);
    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onStop, true);
    window.addEventListener("drop", onStop, true);
    return () => {
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onStop, true);
      window.removeEventListener("drop", onStop, true);
    };
  }, []);

  const finishPaneDrag = React.useCallback(
    (event: DragEndEvent) => {
      const sourcePaneId = String(event.active.id).replace(/^pane:/, "");
      const target = event.over ? parseDropId(String(event.over.id)) : null;
      setDraggedPaneId(null);
      if (!activeTab || !target || target.paneId === sourcePaneId) return;
      movePane(activeTab.id, sourcePaneId, target.paneId, target.position);
    },
    [activeTab, movePane],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) => {
        setDraggedPaneId(String(event.active.id).replace(/^pane:/, ""));
      }}
      onDragCancel={() => setDraggedPaneId(null)}
      onDragEnd={finishPaneDrag}
    >
      <div className="flex h-full w-full">
        <ChatViewHotkeys />
        <ChatSidebarTree />
        <main className="min-w-0 flex-1 p-1.5 pt-0">
          {tabs.length > 0 ? (
            <div className="relative h-full min-h-0 w-full min-w-0">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    aria-hidden={!isActive}
                    className={cn("h-full min-h-0 w-full min-w-0", !isActive && "hidden")}
                  >
                    <PaneTree
                      tab={tab}
                      node={tab.layout}
                      draggedPaneId={isActive ? draggedPaneId : null}
                      nativeDrag={isActive ? nativeDrag : null}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <ChatNewTabPage drag={nativeDrag} />
          )}
        </main>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedPaneId ? (
          <div className="flex cursor-grabbing items-center gap-2 rounded-lg bg-surface-secondary/90 px-2.5 py-1.5 text-[11px] font-medium shadow-2xl ring-1 ring-border backdrop-blur-md">
            <span className="grid h-3.5 w-4.5 grid-cols-2 gap-[2px]">
              <span className="rounded-[1.5px] bg-focus" />
              <span className="rounded-[1.5px] bg-foreground/20" />
            </span>
            Moving pane
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function PaneTree({
  tab,
  node,
  draggedPaneId,
  nativeDrag,
}: {
  tab: TabStateItem;
  node: ItemLayoutNode;
  draggedPaneId: string | null;
  nativeDrag: NativeChatDrag | null;
}) {
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit);
  if (node.type === "pane") {
    return <ItemPane tab={tab} pane={node} draggedPaneId={draggedPaneId} nativeDrag={nativeDrag} />;
  }

  const defaultLayout = Object.fromEntries(
    node.children.map((child, index) => [
      child.id,
      node.sizes[index] ?? 100 / node.children.length,
    ]),
  );
  return (
    <ResizablePanelGroup
      id={node.id}
      orientation={node.orientation}
      defaultLayout={defaultLayout}
      resizeTargetMinimumSize={{ fine: 10, coarse: 20 }}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction) resizeSplit(tab.id, node.id, layout);
      }}
      className="min-h-0 min-w-0"
    >
      {node.children.map((child, index) => (
        <React.Fragment key={child.id}>
          {index > 0 ? (
            <ResizableHandle className="group/resize w-1.5! shrink-0 cursor-col-resize bg-transparent after:w-3 before:absolute before:inset-y-1.5 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-separator before:transition-colors hover:before:bg-focus active:before:bg-focus aria-[orientation=horizontal]:h-1.5! aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:h-3 aria-[orientation=horizontal]:before:inset-x-1.5 aria-[orientation=horizontal]:before:inset-y-auto aria-[orientation=horizontal]:before:top-1/2 aria-[orientation=horizontal]:before:h-px aria-[orientation=horizontal]:before:w-auto aria-[orientation=horizontal]:before:-translate-y-1/2 aria-[orientation=horizontal]:before:translate-x-0" />
          ) : null}
          <ResizablePanel id={child.id} defaultSize={`${node.sizes[index] ?? 50}%`} minSize="280px">
            <PaneTree
              tab={tab}
              node={child}
              draggedPaneId={draggedPaneId}
              nativeDrag={nativeDrag}
            />
          </ResizablePanel>
        </React.Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

function ItemPane({
  tab,
  pane,
  draggedPaneId,
  nativeDrag,
}: {
  tab: TabStateItem;
  pane: ItemPaneState;
  draggedPaneId: string | null;
  nativeDrag: NativeChatDrag | null;
}) {
  const focusPane = useWorkspaceStore((state) => state.focusPane);
  const splitPane = useWorkspaceStore((state) => state.splitPane);
  const openItemInFocusedPane = useWorkspaceStore((state) => state.openItemInFocusedPane);
  const {
    attributes,
    listeners,
    setNodeRef: setDragHandleRef,
    isDragging,
  } = useDraggable({
    id: `pane:${pane.id}`,
    data: { type: "pane", paneId: pane.id },
  });
  const isFocused = tab.focusedPaneId === pane.id;
  const dropIntent = React.useMemo<PaneDropIntent | null>(() => {
    // A pane is never its own drop target.
    if (draggedPaneId !== null) return draggedPaneId === pane.id ? null : "pane";
    if (!nativeDrag) return null;
    if (nativeDrag.kind === "unsupported") return "unsupported";
    // A tab can't hold the same chat twice — `splitPane` would just refocus the existing pane,
    // so point at that pane instead of promising a split.
    const existing = findPaneByItemId(tab.layout, nativeDrag.itemId);
    if (!existing) return "chat";
    return existing.id === pane.id ? "already-here" : "already-open";
  }, [draggedPaneId, nativeDrag, pane.id, tab.layout]);
  const paneContextValue = React.useMemo(
    () => ({ tabId: tab.id, paneId: pane.id, chatId: pane.itemId }),
    [pane.itemId, pane.id, tab.id],
  );

  const handleChatDrop = React.useCallback(
    (event: React.DragEvent, position: PaneDropPosition) => {
      event.preventDefault();
      event.stopPropagation();
      let draggedItems: Array<{ id: string; type: ItemType }> = [];
      try {
        const parsed = JSON.parse(event.dataTransfer.getData(CHAT_DRAG_FORMAT)) as unknown[];
        draggedItems = parsed.flatMap((entry) => {
          if (typeof entry === "string") return [{ id: entry, type: "chat" as const }];
          if (!entry || typeof entry !== "object") return [];
          const item = entry as Record<string, unknown>;
          return typeof item.id === "string" && (item.type === "chat" || item.type === "terminal")
            ? [{ id: item.id, type: item.type }]
            : [];
        });
      } catch {
        return;
      }
      const item = draggedItems[0];
      if (!item) return;
      focusPane(tab.id, pane.id);
      if (position === "center") openItemInFocusedPane(item.id, item.type);
      else splitPane(tab.id, pane.id, item.id, item.type, position);
    },
    [focusPane, openItemInFocusedPane, pane.id, splitPane, tab.id],
  );

  const panel = (
    <ChatScrollActionsProvider>
      <section
        data-pane-id={pane.id}
        data-focused={isFocused || undefined}
        className={cn(
          "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface",
          isDragging && "opacity-50",
        )}
        onPointerDownCapture={() => focusPane(tab.id, pane.id)}
        onFocusCapture={() => focusPane(tab.id, pane.id)}
      >
        <ItemPanelHeader
          pane={pane}
          isFocused={isFocused}
          dragHandleRef={setDragHandleRef}
          dragHandleProps={{ ...attributes, ...listeners }}
          onClose={() => useWorkspaceStore.getState().closePane(tab.id, pane.id)}
        />
        <PaneContent pane={pane} />
        <PaneDropOverlay
          paneId={pane.id}
          intent={dropIntent}
          isFocused={isFocused}
          onDropChat={handleChatDrop}
        />
      </section>
    </ChatScrollActionsProvider>
  );
  return pane.itemType === "chat" ? (
    <ChatPaneProvider value={paneContextValue}>{panel}</ChatPaneProvider>
  ) : (
    panel
  );
}

function PaneContent({ pane }: { pane: ItemPaneState }) {
  if (pane.itemType === "terminal") return <TerminalPane itemId={pane.itemId} />;
  if (pane.view === "/chat/graph") {
    return <ChatGraphPage chatId={pane.itemId} graphMessageId={pane.graphMessageId} />;
  }
  if (pane.view === "/chat/pinned-branches") return <PinnedBranchesPage chatId={pane.itemId} />;
  if (pane.view === "/chat/settings") return <ChatSettingsPage chatId={pane.itemId} />;
  return <ActiveChatView chatId={pane.itemId} />;
}

function parseDropId(id: string): { paneId: string; position: PaneDropPosition } | null {
  const match = /^drop:(.+):(center|left|right|top|bottom)$/.exec(id);
  return match ? { paneId: match[1], position: match[2] as PaneDropPosition } : null;
}

const CHAT_VIEWS: ReadonlyArray<{ to: ChatPaneView; label: string; icon: IconSvgElement }> = [
  { to: "/chat", label: "Conversation", icon: Chatting01Icon },
  { to: "/chat/graph", label: "Graph", icon: WorkflowSquare03Icon },
  { to: "/chat/pinned-branches", label: "Pinned branches", icon: PinIcon },
  { to: "/chat/settings", label: "Chat settings", icon: SlidersHorizontalIcon },
];

function ItemPanelHeader({
  pane,
  isFocused,
  dragHandleRef,
  dragHandleProps,
  onClose,
}: {
  pane: ItemPaneState;
  isFocused: boolean;
  dragHandleRef: (node: HTMLElement | null) => void;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  onClose: () => void;
}) {
  const { data: item } = useQuery(getItemQueryOptions(pane.itemId));

  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b border-separator px-2">
      <div
        ref={dragHandleRef}
        data-window-no-drag
        tabIndex={0}
        aria-label={`Move ${item?.title ?? "item"} pane`}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-0.5 outline-hidden active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-focus/60"
        {...dragHandleProps}
      >
        {pane.itemType === "chat" ? <ChatTitleMenu chatId={pane.itemId} /> : null}
        <span
          className={cn(
            "min-w-0 truncate px-1 text-[13px] font-medium transition-colors duration-150",
            isFocused ? "text-foreground/90" : "text-muted-foreground/60",
          )}
        >
          {item?.title ?? ""}
        </span>
        {isFocused ? <span className="sr-only">Focused pane</span> : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5" data-window-no-drag>
        {pane.itemType === "chat" ? (
          <>
            <ChatHeaderActions pane={pane} />
            <Separator orientation="vertical" className="mx-1 h-4!" />
          </>
        ) : null}
        <HeaderIconButton label="Close pane" icon={Cancel01Icon} onClick={onClose} />
      </div>
    </header>
  );
}

function ChatTitleMenu({ chatId }: { chatId: string }) {
  const port = useSystemStore(selectAiServerPort);
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const { data: sumiSettings } = useQuery(sumiSettingsQueryOptions);
  const [generatingChatId, setGeneratingChatId] = React.useState<string | null>(null);
  const titleGeneration = sumiSettings?.titleGeneration;
  const canGenerateTitle = Boolean(titleGeneration?.enabled && titleGeneration.model && port);
  const isGeneratingTitle = Boolean(chat && generatingChatId === chat.id);
  if (!chat || !canGenerateTitle) return null;

  function generateTitle() {
    if (!port || isGeneratingTitle) return;
    setGeneratingChatId(chatId);
    void generateSumiChatTitle({ apiUrl: `http://127.0.0.1:${port}/api/sumi`, chatId })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Title generation failed",
          description:
            error instanceof Error ? error.message : "Sumi could not generate a chat title.",
        });
      })
      .finally(() => setGeneratingChatId((current) => (current === chatId ? null : current)));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Chat title actions"
            disabled={isGeneratingTitle}
            className="text-muted-foreground"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
        }
      >
        <HugeiconsIcon
          icon={Menu01Icon}
          className={cn("size-3.5!", isGeneratingTitle && "animate-pulse")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start">
        <DropdownMenuItem onClick={generateTitle}>
          <HugeiconsIcon icon={AiBeautifyIcon} />
          Regenerate title
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChatHeaderActions({ pane }: { pane: Extract<ItemPaneState, { itemType: "chat" }> }) {
  const openChatView = useOpenChatView();
  const { scrollActions } = useChatScrollActions();
  return (
    <>
      {pane.view === "/chat" && scrollActions ? (
        <>
          <HeaderIconButton
            label="Scroll to top"
            icon={ArrowUp03Icon}
            onClick={scrollActions.scrollToTop}
          />
          <HeaderIconButton
            label="Scroll to bottom"
            icon={ArrowDown03Icon}
            onClick={scrollActions.scrollToBottom}
          />
          <Separator orientation="vertical" className="mx-1 h-4!" />
        </>
      ) : null}
      {CHAT_VIEWS.map((view) => (
        <HeaderIconButton
          key={view.to}
          label={view.label}
          icon={view.icon}
          isActive={pane.view === view.to}
          onClick={() => openChatView(view.to)}
        />
      ))}
    </>
  );
}

function HeaderIconButton({
  label,
  icon,
  isActive = false,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              "text-muted-foreground",
              isActive && "bg-surface-tertiary text-foreground",
            )}
            onClick={onClick}
          >
            <HugeiconsIcon icon={icon} className="size-3.5!" />
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
