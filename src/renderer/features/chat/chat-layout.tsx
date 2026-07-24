import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
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
import { sumiSettingsQueryOptions } from "@/queries/settings";
import { useOpenChatView } from "@/features/chat/use-chat-view";
import { useWorkspaceStore } from "@/features/workspace/store";
import { cn } from "@/lib/utils";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";
import type { ChatLayoutNode, ChatPaneState, ChatPaneView, TabStateItem } from "@shared/ipc";
import type { PaneDropPosition } from "@/features/workspace/store/layout-tree";
import { CHAT_DRAG_FORMAT } from "./chat-tabs";
import { ChatPaneProvider } from "./chat-pane-context";
import { ActiveChatView } from "./chat-page";
import { ChatGraphPage } from "./modules/graph/chat-graph-page";
import { PinnedBranchesPage } from "./modules/pinned-branches/pinned-branches-page";
import { ChatSettingsPage } from "./chat-settings-page";
import { generateSumiChatTitle } from "./sumi-title-generation";

const DROP_ZONES: PaneDropPosition[] = ["center", "left", "right", "top", "bottom"];

function hasChatDrag(event: React.DragEvent | DragEvent): boolean {
  return event.dataTransfer?.types.includes(CHAT_DRAG_FORMAT) ?? false;
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
  const [nativeChatDragging, setNativeChatDragging] = React.useState(false);
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
    const onStart = (event: DragEvent) => setNativeChatDragging(hasChatDrag(event));
    const onStop = () => setNativeChatDragging(false);
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
                      nativeChatDragging={isActive && nativeChatDragging}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-border bg-surface text-sm text-muted-foreground">
              Open a chat from the sidebar.
            </div>
          )}
        </main>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedPaneId ? (
          <div className="rounded-md border border-border bg-surface-secondary px-3 py-1.5 text-xs font-medium shadow-lg">
            Move chat pane
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
  nativeChatDragging,
}: {
  tab: TabStateItem;
  node: ChatLayoutNode;
  draggedPaneId: string | null;
  nativeChatDragging: boolean;
}) {
  const resizeSplit = useWorkspaceStore((state) => state.resizeSplit);
  if (node.type === "pane") {
    return (
      <ChatPane
        tab={tab}
        pane={node}
        draggedPaneId={draggedPaneId}
        nativeChatDragging={nativeChatDragging}
      />
    );
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
              nativeChatDragging={nativeChatDragging}
            />
          </ResizablePanel>
        </React.Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

function ChatPane({
  tab,
  pane,
  draggedPaneId,
  nativeChatDragging,
}: {
  tab: TabStateItem;
  pane: ChatPaneState;
  draggedPaneId: string | null;
  nativeChatDragging: boolean;
}) {
  const focusPane = useWorkspaceStore((state) => state.focusPane);
  const splitPane = useWorkspaceStore((state) => state.splitPane);
  const openChatInFocusedPane = useWorkspaceStore((state) => state.openChatInFocusedPane);
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
  const showDropZones = nativeChatDragging || draggedPaneId !== null;
  const paneContextValue = React.useMemo(
    () => ({ tabId: tab.id, paneId: pane.id, chatId: pane.chatId }),
    [pane.chatId, pane.id, tab.id],
  );

  const handleChatDrop = React.useCallback(
    (event: React.DragEvent, position: PaneDropPosition) => {
      event.preventDefault();
      event.stopPropagation();
      let chatIds: string[] = [];
      try {
        chatIds = JSON.parse(event.dataTransfer.getData(CHAT_DRAG_FORMAT));
      } catch {
        return;
      }
      const chatId = chatIds[0];
      if (!chatId) return;
      focusPane(tab.id, pane.id);
      if (position === "center") openChatInFocusedPane(chatId);
      else splitPane(tab.id, pane.id, chatId, position);
    },
    [focusPane, openChatInFocusedPane, pane.id, splitPane, tab.id],
  );

  return (
    <ChatPaneProvider value={paneContextValue}>
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
          <ChatPanelHeader
            pane={pane}
            isFocused={isFocused}
            dragHandleRef={setDragHandleRef}
            dragHandleProps={{ ...attributes, ...listeners }}
            onClose={() => useWorkspaceStore.getState().closePane(tab.id, pane.id)}
          />
          <PaneContent pane={pane} />
          {DROP_ZONES.map((position) => (
            <PaneDropZone
              key={position}
              paneId={pane.id}
              position={position}
              visible={showDropZones}
              disabled={draggedPaneId === pane.id}
              onNativeDrop={handleChatDrop}
            />
          ))}
        </section>
      </ChatScrollActionsProvider>
    </ChatPaneProvider>
  );
}

function PaneContent({ pane }: { pane: ChatPaneState }) {
  if (pane.view === "/chat/graph") {
    return <ChatGraphPage chatId={pane.chatId} graphMessageId={pane.graphMessageId} />;
  }
  if (pane.view === "/chat/pinned-branches") return <PinnedBranchesPage chatId={pane.chatId} />;
  if (pane.view === "/chat/settings") return <ChatSettingsPage chatId={pane.chatId} />;
  return <ActiveChatView chatId={pane.chatId} />;
}

function PaneDropZone({
  paneId,
  position,
  visible,
  disabled,
  onNativeDrop,
}: {
  paneId: string;
  position: PaneDropPosition;
  visible: boolean;
  disabled: boolean;
  onNativeDrop: (event: React.DragEvent, position: PaneDropPosition) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${paneId}:${position}`,
    disabled: disabled || !visible,
  });
  // `isOver` only tracks dnd-kit pane drags, and `:hover` is frozen during a native
  // drag, so native chat drags need their own hover state.
  const [isNativeOver, setIsNativeOver] = React.useState(false);
  const enabled = visible && !disabled;
  const active = enabled && (isOver || isNativeOver);
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={cn(
        "absolute rounded-md border border-dashed transition-[background-color,border-color,opacity] duration-100",
        zoneClassName(position),
        enabled ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        active
          ? "border-solid border-focus/60 bg-focus/20"
          : "border-focus/25 bg-surface/50 hover:border-focus/40 hover:bg-focus/10",
      )}
      onDragEnter={(event) => {
        if (hasChatDrag(event)) setIsNativeOver(true);
      }}
      onDragOver={(event) => {
        if (!hasChatDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsNativeOver(true);
      }}
      onDragLeave={() => setIsNativeOver(false)}
      onDrop={(event) => {
        setIsNativeOver(false);
        onNativeDrop(event, position);
      }}
    />
  );
}

function zoneClassName(position: PaneDropPosition): string {
  if (position === "center") return "inset-[24%]";
  if (position === "left") return "inset-y-[18%] left-2 w-[22%]";
  if (position === "right") return "inset-y-[18%] right-2 w-[22%]";
  if (position === "top") return "inset-x-[24%] top-2 h-[22%]";
  return "inset-x-[24%] bottom-2 h-[22%]";
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

function ChatPanelHeader({
  pane,
  isFocused,
  dragHandleRef,
  dragHandleProps,
  onClose,
}: {
  pane: ChatPaneState;
  isFocused: boolean;
  dragHandleRef: (node: HTMLElement | null) => void;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  onClose: () => void;
}) {
  const openChatView = useOpenChatView();
  const { scrollActions } = useChatScrollActions();
  const port = useSystemStore(selectAiServerPort);
  const { data: chat } = useQuery(getChatQueryOptions(pane.chatId));
  const { data: sumiSettings } = useQuery(sumiSettingsQueryOptions);
  const [generatingChatId, setGeneratingChatId] = React.useState<string | null>(null);
  const titleGeneration = sumiSettings?.titleGeneration;
  const canGenerateTitle = Boolean(titleGeneration?.enabled && titleGeneration.model && port);
  const isGeneratingTitle = Boolean(chat && generatingChatId === chat.id);

  function generateTitle() {
    if (!chat || !port || isGeneratingTitle) return;
    const chatId = chat.id;
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
    <header className="flex h-9 shrink-0 items-center gap-1 border-b border-separator px-2">
      <div
        ref={dragHandleRef}
        data-window-no-drag
        tabIndex={0}
        aria-label={`Move ${chat?.title ?? "chat"} pane`}
        className="flex min-w-0 flex-1 cursor-grab items-center gap-0.5 outline-hidden active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-focus/60"
        {...dragHandleProps}
      >
        {chat && canGenerateTitle ? (
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
                icon={AiBeautifyIcon}
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
        ) : null}
        <span
          className={cn(
            "min-w-0 truncate px-1 text-[13px] font-medium transition-colors duration-150",
            isFocused ? "text-foreground/90" : "text-muted-foreground/60",
          )}
        >
          {chat?.title ?? ""}
        </span>
        {isFocused ? <span className="sr-only">Focused pane</span> : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5" data-window-no-drag>
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
        <Separator orientation="vertical" className="mx-1 h-4!" />
        <HeaderIconButton label="Close pane" icon={Cancel01Icon} onClick={onClose} />
      </div>
    </header>
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
