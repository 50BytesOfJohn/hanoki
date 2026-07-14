import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button as HeroButton, Dropdown, Separator, type Key } from "@heroui/react";
import {
  Add01Icon,
  CircleIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Setting07Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { listWorkspacesQueryOptions } from "@/queries/workspaces";
import hanokiLogoUrl from "../../../../assets/logo.png";
import { useChatSidebar } from "./chat-sidebar";
import { useWorkspaceStore } from "../workspace/store";

const CREATE_WORKSPACE_ACTION_ID = "create-workspace";

export function ChatToolbar() {
  const navigate = useNavigate();
  const { data: workspaces = [] } = useQuery(listWorkspacesQueryOptions);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const { isMobile, open, openMobile, toggleSidebar } = useChatSidebar();
  const isSidebarOpen = isMobile ? openMobile : open;

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
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

        <img
          src={hanokiLogoUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="mx-0.5 size-5 shrink-0 select-none"
        />

        <Dropdown>
          <HeroButton
            variant="ghost"
            size="sm"
            className="h-6 gap-1.5 rounded-md px-2 text-xs font-medium"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: workspace?.color ?? "var(--muted)" }}
            />
            <span className="max-w-40 truncate">{workspace?.name ?? "…"}</span>
          </HeroButton>
          <Dropdown.Popover placement="bottom start">
            <Dropdown.Menu
              onAction={(key: Key) => {
                if (key === CREATE_WORKSPACE_ACTION_ID) {
                  void navigate({ to: "/settings/workspaces/new" });
                  return;
                }

                switchWorkspace(String(key));
              }}
            >
              <Dropdown.Section
                selectionMode="single"
                selectedKeys={workspace ? [workspace.id] : []}
              >
                {workspaces.map((ws) => (
                  <Dropdown.Item key={ws.id} id={ws.id} textValue={ws.name}>
                    <Dropdown.ItemIndicator type="dot" />
                    <HugeiconsIcon
                      icon={CircleIcon}
                      className="size-3"
                      color={ws.color ?? "current"}
                      fill={ws.color ?? "current"}
                    />
                    {ws.name}
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
              <Separator />
              <Dropdown.Section>
                <Dropdown.Item id={CREATE_WORKSPACE_ACTION_ID} textValue="Create Workspace">
                  <HugeiconsIcon icon={Add01Icon} />
                  Create Workspace
                </Dropdown.Item>
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

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
