import { Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { Button, ButtonGroup, Surface } from "@heroui/react";

import { WindowChrome } from "@/components/app/window-chrome";
import { ChatSidebarProvider, useChatSidebar } from "@/features/chat/chat-sidebar";
import { ChatSidebarTree } from "@/features/chat/chat-sidebar-tree";
import {
  ChatScrollActionsProvider,
  useChatScrollActions,
} from "@/features/chat/chat-scroll-actions-context";
import { ChatToolbar } from "@/features/chat/chat-toolbar";
import { ChatViewHotkeys } from "@/features/chat/chat-view-hotkeys";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown03Icon,
  ArrowUp03Icon,
  Chatting01Icon,
  PinIcon,
  Setting07Icon,
  WorkflowSquare03Icon,
} from "@hugeicons/core-free-icons";

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
  const { isMobile, open } = useChatSidebar();
  const isDesktopSidebarVisible = !isMobile && open;

  return (
    <ChatScrollActionsProvider>
      <div className="flex h-full w-full">
        <ChatViewHotkeys />
        <ChatSidebarTree />
        <div className="w-full h-full p-2 pt-0">
          <Surface
            className={cn(
              "w-full relative flex h-full flex-col overflow-hidden",
              isDesktopSidebarVisible ? "rounded-3xl" : "rounded-3xl",
            )}
          >
            {/* <div
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden bg-card",
            isDesktopSidebarVisible ? "rounded-l-2xl" : "rounded-2xl",
            )}
            > */}
            <Outlet />

            <ChatContentNavigation />
          </Surface>
        </div>
        {/* </div> */}
      </div>
    </ChatScrollActionsProvider>
  );
}

function ChatContentNavigation() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { scrollActions } = useChatScrollActions();
  const isChatView = !!matchRoute({ to: "/chat" });

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2">
      <ButtonGroup size="sm" variant="ghost">
        <Button
          isIconOnly
          variant={matchRoute({ to: "/chat" }) ? "tertiary" : undefined}
          onPress={() => {
            void navigate({ to: "/chat" });
          }}
        >
          <HugeiconsIcon icon={Chatting01Icon} />
        </Button>
        <Button
          isIconOnly
          variant={matchRoute({ to: "/chat/graph" }) ? "tertiary" : undefined}
          onPress={() => {
            void navigate({ to: "/chat/graph" });
          }}
        >
          <ButtonGroup.Separator />
          <HugeiconsIcon icon={WorkflowSquare03Icon} />
        </Button>
        <Button
          isIconOnly
          variant={matchRoute({ to: "/chat/pinned-branches" }) ? "tertiary" : undefined}
          onPress={() => {
            void navigate({ to: "/chat/pinned-branches" });
          }}
        >
          <ButtonGroup.Separator />
          <HugeiconsIcon icon={PinIcon} />
        </Button>
        <Button
          isIconOnly
          variant={matchRoute({ to: "/chat/settings" }) ? "tertiary" : undefined}
          onPress={() => {
            void navigate({ to: "/chat/settings" });
          }}
        >
          <ButtonGroup.Separator />
          <HugeiconsIcon icon={Setting07Icon} />
        </Button>

        {isChatView && scrollActions
          ? [
              <Button
                key="scroll-top"
                isIconOnly
                onPress={scrollActions.scrollToTop}
                aria-label="Scroll to top"
              >
                <ButtonGroup.Separator />
                <HugeiconsIcon icon={ArrowUp03Icon} />
              </Button>,
              <Button
                key="scroll-bottom"
                isIconOnly
                onPress={scrollActions.scrollToBottom}
                aria-label="Scroll to bottom"
              >
                <ButtonGroup.Separator />
                <HugeiconsIcon icon={ArrowDown03Icon} />
              </Button>,
            ]
          : null}
      </ButtonGroup>
    </div>
  );
}
