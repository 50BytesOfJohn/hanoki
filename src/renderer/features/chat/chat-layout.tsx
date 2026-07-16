import * as React from "react";
import { Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  AiBeautifyIcon,
  ArrowDown03Icon,
  ArrowUp03Icon,
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
import { useWorkspaceStore } from "@/features/workspace/store";
import { cn } from "@/lib/utils";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";
import { generateSumiChatTitle } from "./sumi-title-generation";

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
  return (
    <ChatScrollActionsProvider>
      <div className="flex h-full w-full">
        <ChatViewHotkeys />
        <ChatSidebarTree />
        <div className="min-w-0 flex-1 p-1.5 pt-0">
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <ChatPanelHeader />
            <Outlet />
          </div>
        </div>
      </div>
    </ChatScrollActionsProvider>
  );
}

const CHAT_VIEWS = [
  { to: "/chat", label: "Conversation", icon: Chatting01Icon, exact: true },
  { to: "/chat/graph", label: "Graph", icon: WorkflowSquare03Icon },
  { to: "/chat/pinned-branches", label: "Pinned branches", icon: PinIcon },
  { to: "/chat/settings", label: "Chat settings", icon: SlidersHorizontalIcon },
] as const;

function ChatPanelHeader() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { scrollActions } = useChatScrollActions();
  const port = useSystemStore(selectAiServerPort);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);
  const { data: chat } = useQuery(
    getChatQueryOptions(currentChatId, { enabled: currentChatId !== null }),
  );
  const { data: sumiSettings } = useQuery(sumiSettingsQueryOptions);
  const [generatingChatId, setGeneratingChatId] = React.useState<string | null>(null);
  const isChatView = !!matchRoute({ to: "/chat" });
  const titleGeneration = sumiSettings?.titleGeneration;
  const canGenerateTitle = Boolean(titleGeneration?.enabled && titleGeneration.model && port);
  const isGeneratingTitle = Boolean(chat && generatingChatId === chat.id);

  function generateTitle() {
    if (!chat || !port || isGeneratingTitle) {
      return;
    }

    const chatId = chat.id;
    setGeneratingChatId(chatId);
    void generateSumiChatTitle({
      apiUrl: `http://127.0.0.1:${port}/api/sumi`,
      chatId,
    })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Title generation failed",
          description:
            error instanceof Error ? error.message : "Sumi could not generate a chat title.",
        });
      })
      .finally(() => {
        setGeneratingChatId((current) => (current === chatId ? null : current));
      });
  }

  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b border-separator px-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
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
        <span className="min-w-0 truncate px-1 text-[13px] font-medium text-foreground/90">
          {chat?.title ?? ""}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {isChatView && scrollActions ? (
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

        {CHAT_VIEWS.map((view) => {
          const isActive = !!matchRoute({ to: view.to, fuzzy: !("exact" in view) });
          return (
            <HeaderIconButton
              key={view.to}
              label={view.label}
              icon={view.icon}
              isActive={isActive}
              onClick={() => {
                void navigate({ to: view.to });
              }}
            />
          );
        })}
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
