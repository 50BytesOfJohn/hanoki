import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Add01Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  FileScriptIcon,
} from "@hugeicons/core-free-icons";

import { ChatActivityIndicator } from "./chat-activity-indicator";
import { useNewChatTab } from "./use-new-chat-tab";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getItemQueryOptions } from "@/queries/items";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { useChatStatus } from "@/stores/chat-store";
import { modShortcut } from "@/lib/platform";
import { cn } from "cn";
import type { ChatTabsPosition, ItemType } from "@shared/ipc";
import type { Tab } from "../workspace/store/types";
import { useWorkspaceStore } from "../workspace/store";
import { getFocusedPane, getPanes } from "../workspace/store/layout-tree";

/** DataTransfer format for items dragged out of the sidebar tree. */
export const CHAT_DRAG_FORMAT = "application/x-hanoki-items";

function readDraggedItems(event: React.DragEvent): Array<{ id: string; type: ItemType }> {
  const parsed = JSON.parse(event.dataTransfer.getData(CHAT_DRAG_FORMAT)) as unknown[];
  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return typeof item.id === "string" &&
      (item.type === "chat" || item.type === "terminal" || item.type === "markdown")
      ? [{ id: item.id, type: item.type }]
      : [];
  });
}

/** Null until the setting has loaded, so a sidebar strip doesn't first render in the toolbar. */
export function useChatTabsPosition(): ChatTabsPosition | null {
  const { data, isPending } = useQuery(globalChatSettingsQueryOptions);
  return isPending ? null : (data?.tabsPosition ?? "top");
}

function useTabStrip() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const moveTab = useWorkspaceStore((s) => s.moveTab);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const toIndex = tabs.findIndex((tab) => tab.id === over.id);
    if (toIndex !== -1) {
      moveTab(String(active.id), toIndex);
    }
  };

  return { tabs, activeTabId, sensors, handleDragEnd };
}

/* ── Horizontal strip (window toolbar) ── */

export function ChatTabsBar() {
  const { tabs, activeTabId, sensors, handleDragEnd } = useTabStrip();
  const openTab = useWorkspaceStore((s) => s.openTab);
  const openNewChat = useNewChatTab();
  const [isChatDropTarget, setIsChatDropTarget] = React.useState(false);

  const hasChatDrag = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(CHAT_DRAG_FORMAT);

  return (
    <div
      onDragOver={(event) => {
        if (hasChatDrag(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsChatDropTarget(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsChatDropTarget(false);
        }
      }}
      onDrop={(event) => {
        setIsChatDropTarget(false);
        if (!hasChatDrag(event)) {
          return;
        }
        event.preventDefault();
        for (const item of readDraggedItems(event)) openTab({ type: item.type, itemId: item.id });
      }}
      className={cn(
        "flex h-full min-w-0 flex-1 items-center gap-1 rounded-md",
        isChatDropTarget && "bg-hover ring-1 ring-muted-foreground/30 ring-dashed",
      )}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
          <div
            role="tablist"
            aria-label="Open chats"
            aria-orientation="horizontal"
            className="flex h-full min-w-0 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((tab, index) => (
              <ChatTabItem
                key={tab.id}
                tab={tab}
                orientation="horizontal"
                isActive={activeTabId === tab.id}
                index={index}
                tabCount={tabs.length}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button
        size="icon-xs"
        variant="ghost"
        data-window-no-drag
        className="shrink-0 text-muted-foreground"
        aria-label="New chat tab"
        title={`New chat tab (${modShortcut("T")})`}
        onClick={openNewChat}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-3.5!" />
      </Button>
    </div>
  );
}

/* ── Vertical list (sidebar "Tabs" section) ── */

export function ChatTabsSidebarList() {
  const { tabs, activeTabId, sensors, handleDragEnd } = useTabStrip();

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((tab) => tab.id)} strategy={verticalListSortingStrategy}>
        <div
          role="tablist"
          aria-label="Open chats"
          aria-orientation="vertical"
          className="flex flex-col gap-0.5 px-1"
        >
          {tabs.map((tab, index) => (
            <ChatTabItem
              key={tab.id}
              tab={tab}
              orientation="vertical"
              isActive={activeTabId === tab.id}
              index={index}
              tabCount={tabs.length}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/* ── Tab item ── */

// Memoized so switching tabs re-renders the two tabs involved, not the whole strip.
const ChatTabItem = React.memo(function ChatTabItem({
  tab,
  orientation,
  isActive,
  index,
  tabCount,
}: {
  tab: Tab;
  orientation: "horizontal" | "vertical";
  isActive: boolean;
  index: number;
  tabCount: number;
}) {
  const selectTab = useWorkspaceStore((s) => s.selectTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs);
  const closeTabsToLeft = useWorkspaceStore((s) => s.closeTabsToLeft);
  const closeTabsToRight = useWorkspaceStore((s) => s.closeTabsToRight);
  const keepTab = useWorkspaceStore((s) => s.keepTab);
  const reopenClosedTab = useWorkspaceStore((s) => s.reopenClosedTab);
  const hasClosedTabs = useWorkspaceStore((s) => s.closedTabs.length > 0);
  const onSelect = () => selectTab(tab.id);
  const onClose = () => closeTab(tab.id);
  const focusedPane = getFocusedPane(tab);
  const paneCount = getPanes(tab.layout).length;
  const { data: item } = useQuery(getItemQueryOptions(focusedPane.itemId));
  const title = item?.title ?? "";
  const isHorizontal = orientation === "horizontal";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const elementRef = React.useRef<HTMLDivElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      elementRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  // Keep the active tab visible when it changes via shortcut or sidebar click. Before paint,
  // so the strip doesn't show a frame with the newly active tab still out of view.
  React.useLayoutEffect(() => {
    if (isActive) {
      elementRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [isActive]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={setRefs}
            {...attributes}
            {...listeners}
            role="tab"
            aria-selected={isActive}
            data-window-no-drag
            tabIndex={0}
            title={tab.preview ? `${title} (preview: double-click to keep open)` : title}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            onClick={onSelect}
            onDoubleClick={() => keepTab(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }}
            className={cn(
              "group/tab relative flex h-7 items-center gap-1.5 rounded-md pl-2 pr-1 text-[13px] outline-hidden select-none",
              "focus-visible:ring-1 focus-visible:ring-focus/60",
              // Only hovering fades. Selection is instant: a fade here shows two half-lit
              // tabs on every switch, and a hover color would hide the tab just selected.
              isActive
                ? "bg-surface-tertiary text-foreground"
                : "text-foreground/75 hover:bg-hover hover:transition-colors hover:duration-100",
              // Chrome's model: tabs shrink evenly from 11rem down to a 7rem floor,
              // then the strip scrolls. Below the floor a title is unreadable, and a
              // strip of identical stubs is worse than scrolling.
              isHorizontal && "w-fit min-w-28 max-w-44 shrink basis-44 text-[12.5px]",
              isDragging && "z-10 opacity-80 shadow-sm",
            )}
          >
            <span className="flex min-w-0 flex-1 items-center">
              {focusedPane.itemType === "chat" ? (
                <ChatTabActivitySlot chatId={focusedPane.itemId} />
              ) : (
                <HugeiconsIcon
                  icon={
                    focusedPane.itemType === "terminal" ? ComputerTerminal01Icon : FileScriptIcon
                  }
                  className="mr-1.5 size-3.5! shrink-0 text-muted-foreground"
                />
              )}
              <span className={cn("truncate", tab.preview && "pr-0.5 italic")}>{title}</span>
            </span>
            {paneCount > 1 ? (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {paneCount}
              </span>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              className={cn(
                "size-5 min-w-0 shrink-0 rounded p-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-3",
                "opacity-0 group-hover/tab:opacity-100 group-hover/tab:transition-opacity focus-visible:opacity-100",
                isActive && "opacity-50 group-hover/tab:opacity-100",
              )}
              aria-label={`Close ${title} tab`}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        }
      />
      <ContextMenuContent className="w-48">
        {tab.preview ? (
          <ContextMenuItem onClick={() => keepTab(tab.id)}>Keep Tab Open</ContextMenuItem>
        ) : null}
        <ContextMenuItem onClick={onClose}>Close Tab</ContextMenuItem>
        <ContextMenuItem disabled={tabCount < 2} onClick={() => closeOtherTabs(tab.id)}>
          Close Other Tabs
        </ContextMenuItem>
        <ContextMenuItem disabled={index === 0} onClick={() => closeTabsToLeft(tab.id)}>
          Close Tabs to the Left
        </ContextMenuItem>
        <ContextMenuItem disabled={index === tabCount - 1} onClick={() => closeTabsToRight(tab.id)}>
          Close Tabs to the Right
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasClosedTabs} onClick={reopenClosedTab}>
          Reopen Closed Tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

/*
 * Streaming marker. A slot that widens from nothing to the indicator's width, so
 * the title slides right to make room instead of being covered up. The tab keeps
 * its size either way: its width comes from flex-basis, not from its content.
 *
 * Always mounted, toggled by `data-active`, so both directions animate and a
 * stream that stops and restarts mid-transition retargets instead of snapping —
 * transitions interrupt cleanly, keyframes would restart from zero.
 */
function ChatTabActivitySlot({ chatId }: { chatId: string }) {
  const status = useChatStatus(chatId);
  const isActive = status === "streaming" || status === "submitted";

  return (
    <span
      aria-hidden={!isActive}
      data-active={isActive || undefined}
      className={cn(
        // 1.25rem = the 14px indicator plus the gap it needs before the title.
        "flex w-0 shrink-0 items-center overflow-hidden text-muted-foreground",
        "transition-[width] duration-200 ease-out-quint motion-reduce:transition-none",
        "data-active:w-5",
      )}
    >
      <ChatActivityIndicator
        paused={!isActive}
        // Fades faster than the slot opens, so the space is already there when
        // the marker lands rather than the marker fighting the sliding title.
        className={cn(
          "scale-90 opacity-0 transition duration-150 ease-out-quint motion-reduce:transition-none",
          isActive && "scale-100 opacity-100",
        )}
      />
    </span>
  );
}
