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
import { Cancel01Icon, Chat01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getChatQueryOptions } from "@/queries/chats";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { useChatStatus } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import type { ChatTabsPosition } from "@shared/ipc";
import type { Tab } from "../workspace/store/types";
import { useWorkspaceStore } from "../workspace/store";

export function useChatTabsPosition(): ChatTabsPosition {
  const { data } = useQuery(globalChatSettingsQueryOptions);
  return data?.tabsPosition ?? "top";
}

function useTabStrip() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);
  const setCurrentChat = useWorkspaceStore((s) => s.setCurrentChat);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs);
  const moveTab = useWorkspaceStore((s) => s.moveTab);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const toIndex = tabs.findIndex((tab) => tab.id === over.id);
      if (toIndex !== -1) {
        moveTab(String(active.id), toIndex);
      }
    },
    [moveTab, tabs],
  );

  return { tabs, currentChatId, setCurrentChat, closeTab, closeOtherTabs, sensors, handleDragEnd };
}

/* ── Horizontal strip (window toolbar) ── */

export function ChatTabsBar() {
  const { tabs, currentChatId, setCurrentChat, closeTab, closeOtherTabs, sensors, handleDragEnd } =
    useTabStrip();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
        <div
          role="tablist"
          aria-label="Open chats"
          aria-orientation="horizontal"
          className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => (
            <ChatTabItem
              key={tab.id}
              tab={tab}
              orientation="horizontal"
              isActive={currentChatId === tab.chatId}
              canCloseOthers={tabs.length > 1}
              onSelect={() => setCurrentChat(tab.chatId)}
              onClose={() => closeTab(tab.id)}
              onCloseOthers={() => closeOtherTabs(tab.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/* ── Vertical list (sidebar "Tabs" section) ── */

export function ChatTabsSidebarList() {
  const { tabs, currentChatId, setCurrentChat, closeTab, closeOtherTabs, sensors, handleDragEnd } =
    useTabStrip();

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((tab) => tab.id)} strategy={verticalListSortingStrategy}>
        <div
          role="tablist"
          aria-label="Open chats"
          aria-orientation="vertical"
          className="flex flex-col gap-0.5 px-1"
        >
          {tabs.map((tab) => (
            <ChatTabItem
              key={tab.id}
              tab={tab}
              orientation="vertical"
              isActive={currentChatId === tab.chatId}
              canCloseOthers={tabs.length > 1}
              onSelect={() => setCurrentChat(tab.chatId)}
              onClose={() => closeTab(tab.id)}
              onCloseOthers={() => closeOtherTabs(tab.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/* ── Tab item ── */

function ChatTabItem({
  tab,
  orientation,
  isActive,
  canCloseOthers,
  onSelect,
  onClose,
  onCloseOthers,
}: {
  tab: Tab;
  orientation: "horizontal" | "vertical";
  isActive: boolean;
  canCloseOthers: boolean;
  onSelect: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
}) {
  const { data: chat } = useQuery(getChatQueryOptions(tab.chatId));
  const title = chat?.title ?? "Loading…";
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

  // Keep the active tab visible when it changes via shortcut or sidebar click.
  React.useEffect(() => {
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
            title={title}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            onClick={onSelect}
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
              "group/tab relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md pl-2 pr-1 text-[13px] outline-hidden select-none transition-colors duration-100",
              "hover:bg-hover focus-visible:ring-1 focus-visible:ring-focus/60",
              isActive ? "bg-surface-tertiary text-foreground" : "text-foreground/75",
              isHorizontal && "w-fit min-w-0 max-w-44 shrink basis-44 text-[12.5px]",
              isDragging && "z-10 opacity-80 shadow-sm",
            )}
          >
            <ChatTabStatusIcon chatId={tab.chatId} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              className={cn(
                "size-5 min-w-0 shrink-0 rounded p-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-3",
                "opacity-0 transition-opacity group-hover/tab:opacity-100 focus-visible:opacity-100",
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
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onClose}>Close Tab</ContextMenuItem>
        <ContextMenuItem disabled={!canCloseOthers} onClick={onCloseOthers}>
          Close Other Tabs
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ChatTabStatusIcon({ chatId }: { chatId: string }) {
  const status = useChatStatus(chatId);
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <span className="flex shrink-0 items-center justify-center text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5">
      {isStreaming ? (
        <span className="flex size-3.5 items-center justify-center">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
        </span>
      ) : (
        <HugeiconsIcon icon={Chat01Icon} />
      )}
    </span>
  );
}
