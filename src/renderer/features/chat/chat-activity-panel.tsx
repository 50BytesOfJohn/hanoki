import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertCircleIcon,
  Archive02Icon,
  Archive04Icon,
  Chatting01Icon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ChatActivityIndicator } from "./chat-activity-indicator";

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
 * One 24px slot in the toolbar for chats in this workspace that are working, or
 * that replied while the user was elsewhere — the same box as the settings button
 * beside it, so the tab strip that flexes into the remaining space never resizes.
 * Two side-by-side counters cost ~80px of fixed width, nearly all of it empty in
 * the common case; a single slot spends the space it occupies.
 *
 * The states are a priority, not a sum: in-flight work outranks a reply you have
 * not read, which outranks nothing to do. Because that hides unread behind work,
 * the working state carries a corner dot when unread is also non-zero. Exact
 * counts live in the tooltip and the popover — the slot only carries the state.
 *
 * ponytail: tool approval lands as a fourth state — slot it above `unread` in the
 * chain below, add a clause to `summarize`, and give it a distinct glyph.
 */
export function ChatActivityPanel() {
  const { data: settings } = useQuery(globalChatSettingsQueryOptions);
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const entries = useWorkspaceChatActivity(workspaceId);
  const [isOpen, setIsOpen] = React.useState(false);
  const updateSettings = useUpdateGlobalChatSettings();

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
                  size="icon-xs"
                  aria-label={`Chat activity — ${summary}`}
                  className="relative shrink-0 text-muted-foreground"
                />
              }
            >
              {workingCount > 0 ? (
                // The same board the tab strip and the tree use for a streaming
                // chat — one vocabulary for "this is working", wherever it shows.
                <ChatActivityIndicator className="text-primary" />
              ) : unreadCount > 0 ? (
                <HugeiconsIcon icon={Archive02Icon} className="size-3.5!" />
              ) : (
                <HugeiconsIcon icon={Archive04Icon} className="size-3.5!" />
              )}
              {/* Work outranks unread in the slot, so the badge is what keeps unread
                  visible while something streams. Absolute, so it never widens the
                  fixed slot. Capped at 9+ — three glyphs would spill onto the gear,
                  and the exact number is one hover away in the tooltip. */}
              {unreadCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute top-0 right-0 flex h-3 min-w-3 items-center justify-center rounded-full bg-foreground/75 px-0.5 font-mono text-[9px] leading-none font-medium text-background"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </PopoverTrigger>
          }
        />
        <TooltipContent side="bottom">{summary}</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 gap-0 p-0">
        {/* Header: title + rare hide control on the left; mark-all on the right only
            when it applies. Keeps the accidental-hide target away from the common
            action and off the bottom edge of the list. */}
        <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 pl-1">
            <PopoverTitle className="truncate text-[13px]">Activity</PopoverTitle>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Hide activity panel"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => {
                      updateSettings.mutate({ activityPanelEnabled: false });
                      toastManager.add({
                        title: "Activity panel hidden",
                        description:
                          "Bring it back from View → Show Activity Panel, or Settings → General.",
                      });
                    }}
                  >
                    <HugeiconsIcon icon={ViewOffSlashIcon} className="size-3!" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Hide panel</TooltipContent>
            </Tooltip>
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0 text-muted-foreground"
              onClick={() => {
                if (workspaceId) useChatActivityStore.getState().markWorkspaceRead(workspaceId);
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        <Separator />
        <ActivityList entries={entries} onOpenChat={() => setIsOpen(false)} />
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
          // Same Conway board as tabs / tree / toolbar — one "working" glyph everywhere.
          <ChatActivityIndicator />
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

/** Keeps the elapsed times in an open popover honest. Only runs while it is open. */
function useElapsedTicker(enabled: boolean) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
}
