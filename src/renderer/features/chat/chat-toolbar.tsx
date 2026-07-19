import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Add01Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Setting07Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { WorkspaceOrb } from "@/components/ui/workspace-orb";
import { listWorkspacesQueryOptions } from "@/queries/workspaces";
import { useChatSidebar } from "./chat-sidebar";
import { ChatTabsBar, useChatTabsPosition } from "./chat-tabs";
import { useWorkspaceStore } from "../workspace/store";

export function ChatToolbar() {
  const navigate = useNavigate();
  const { data: workspaces = [] } = useQuery(listWorkspacesQueryOptions);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const { isMobile, open, openMobile, toggleSidebar } = useChatSidebar();
  const isSidebarOpen = isMobile ? openMobile : open;
  const tabsPosition = useChatTabsPosition();
  const showTopTabs = tabsPosition === "top";
  // Align the tab strip's left edge with the chat card (sidebar's right edge)
  // when the sidebar is open: sidebar width minus traffic-light spacer and the
  // toolbar's 0.5rem horizontal padding.
  const alignTabsWithChatCard = showTopTabs && !isMobile && open;

  return (
    <div className="flex h-full w-full items-center justify-between gap-2">
      <div
        className={cn(
          "flex min-w-0 shrink-0 items-center gap-1 transition-[min-width] duration-150 ease-out",
          alignTabsWithChatCard &&
            "min-w-[calc(var(--chat-sidebar-width)-var(--window-traffic-lights-spacer)-0.5rem)]",
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          onClick={toggleSidebar}
        >
          <HugeiconsIcon
            icon={isSidebarOpen ? PanelLeftCloseIcon : PanelLeftOpenIcon}
            className="size-4!"
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="xs" className="group/orb gap-1.5 px-2 font-medium" />
            }
          >
            <WorkspaceOrb color={workspace?.color} size="xs" />
            <span className="max-w-40 truncate">{workspace?.name ?? "…"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start">
            <DropdownMenuGroup>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  className="group/orb"
                  onClick={() => {
                    switchWorkspace(ws.id);
                  }}
                >
                  <WorkspaceOrb color={ws.color} size="xs" />
                  {ws.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  void navigate({ to: "/settings/workspaces/new" });
                }}
              >
                <HugeiconsIcon icon={Add01Icon} />
                Create Workspace
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showTopTabs ? <ChatTabsBar /> : null}

      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label="Settings"
        onClick={() => {
          void navigate({ to: "/settings" });
        }}
      >
        <HugeiconsIcon icon={Setting07Icon} className="size-4!" />
      </Button>
    </div>
  );
}
