import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircleIcon,
  Chatting01Icon,
  Loading03Icon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateGlobalChatSettings } from "@/mutations/settings";
import { getChatQueryOptions } from "@/queries/chats";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { cn } from "@/lib/utils";
import {
  useChatActivityStore,
  useWorkspaceChatActivity,
  type ChatActivityEntry,
} from "@/stores/chat-activity-store";
import { useWorkspaceStore } from "../workspace/store";

/**
 * Toolbar counters for chats in this workspace that are working, or that replied
 * while the user was elsewhere. The trigger has a fixed width, so counts ticking
 * over never nudge the tab strip beside it.
 *
 * ponytail: tool approval lands as a third counter — add its kind to the activity
 * store, one `<ActivityCount>` below, and a clause in `summarize`.
 */
export function ChatActivityPanel() {
  const { data: settings } = useQuery(globalChatSettingsQueryOptions);
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const entries = useWorkspaceChatActivity(workspaceId);
  const [isOpen, setIsOpen] = React.useState(false);

  if (settings && !settings.activityPanelEnabled) {
    return null;
  }

  const workingCount = entries.filter((entry) => entry.kind === "working").length;
  const unreadCount = entries.length - workingCount;
  const summary = summarize(workingCount, unreadCount);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip disabled={isOpen}>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Chat activity — ${summary}`}
                  className="w-20 shrink-0 justify-center gap-0 px-1 tabular-nums"
                />
              }
            >
              <ActivityCount count={workingCount} tone="working">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className={cn("size-3!", workingCount > 0 && "animate-spin")}
                />
              </ActivityCount>
              <ActivityCount count={unreadCount} tone="unread">
                <span className="size-1.5 rounded-full bg-current" />
              </ActivityCount>
            </PopoverTrigger>
          }
        />
        <TooltipContent side="bottom">{summary}</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-2">
          <PopoverTitle className="text-[13px]">Activity</PopoverTitle>
          <span className="truncate text-xs text-muted-foreground">{summary}</span>
        </div>
        <Separator />
        <ActivityList entries={entries} onOpenChat={() => setIsOpen(false)} />
        <Separator />
        <ActivityFooter
          canMarkRead={unreadCount > 0}
          onMarkRead={() => {
            if (workspaceId) useChatActivityStore.getState().markWorkspaceRead(workspaceId);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function summarize(workingCount: number, unreadCount: number): string {
  const parts = [
    workingCount > 0 && `${workingCount} working`,
    unreadCount > 0 && `${unreadCount} unread`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "All caught up";
}

function ActivityCount({
  count,
  tone,
  children,
}: {
  count: number;
  tone: "working" | "unread";
  children: React.ReactNode;
}) {
  return (
    // Each slot is a fixed 2.25rem so counts changing width never resize the trigger.
    <span
      aria-hidden
      className={cn(
        "flex w-9 items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-100",
        count === 0 && "text-muted-foreground/40",
        count > 0 && (tone === "working" ? "text-primary" : "text-foreground"),
      )}
    >
      {children}
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* ── Popover body ── */

function ActivityList({
  entries,
  onOpenChat,
}: {
  entries: ChatActivityEntry[];
  onOpenChat: () => void;
}) {
  useElapsedTicker(entries.length > 0);

  if (entries.length === 0) {
    return (
      <Empty className="gap-0 border-0 px-6 py-7">
        <EmptyHeader className="gap-1.5">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Chatting01Icon} />
          </EmptyMedia>
          <EmptyTitle className="text-[13px]">Nothing in flight</EmptyTitle>
          <EmptyDescription className="text-xs">
            Chats still writing — and replies that land while you are reading something else —
            collect here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="scrollbar flex max-h-80 flex-col overflow-y-auto p-1">
      {entries.map((entry) => (
        <ActivityRow key={entry.chatId} entry={entry} onOpenChat={onOpenChat} />
      ))}
    </div>
  );
}

function ActivityRow({ entry, onOpenChat }: { entry: ChatActivityEntry; onOpenChat: () => void }) {
  const setCurrentChat = useWorkspaceStore((state) => state.setCurrentChat);
  const { data: chat } = useQuery(getChatQueryOptions(entry.chatId));

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-hidden transition-colors duration-100 hover:bg-hover focus-visible:bg-hover"
      onClick={() => {
        setCurrentChat(entry.chatId);
        onOpenChat();
      }}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center",
          entry.outcome === "error" ? "text-danger" : "text-primary",
        )}
      >
        {entry.kind === "working" ? (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5! animate-spin" />
        ) : entry.outcome === "error" ? (
          <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5!" />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-foreground">
          {chat?.title ?? "Untitled chat"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{describe(entry)}</span>
      </span>
    </button>
  );
}

function describe(entry: ChatActivityEntry): string {
  const elapsed = formatDistanceToNowStrict(entry.since);
  if (entry.kind === "working") return `Working · ${elapsed} so far`;
  if (entry.outcome === "error") return `Stopped on an error · ${elapsed} ago`;
  return `Replied · ${elapsed} ago`;
}

function ActivityFooter({
  canMarkRead,
  onMarkRead,
}: {
  canMarkRead: boolean;
  onMarkRead: () => void;
}) {
  const updateSettings = useUpdateGlobalChatSettings();

  return (
    <div className="flex items-center justify-between gap-2 p-1">
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        disabled={!canMarkRead}
        onClick={onMarkRead}
      >
        Mark all read
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={() => {
          updateSettings.mutate({ activityPanelEnabled: false });
          toastManager.add({
            title: "Activity panel hidden",
            description: "Bring it back from View → Show Activity Panel, or Settings → General.",
          });
        }}
      >
        <HugeiconsIcon icon={ViewOffSlashIcon} />
        Hide panel
      </Button>
    </div>
  );
}

/** Keeps the elapsed times in an open popover honest. Only runs while it is open. */
function useElapsedTicker(enabled: boolean) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
}
