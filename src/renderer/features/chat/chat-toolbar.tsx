import type { CSSProperties } from "react";
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

import { listWorkspacesQueryOptions } from "@/queries/workspaces";
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
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2 w-full">
        <HeroButton
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          onPress={toggleSidebar}
        >
          <HugeiconsIcon icon={isSidebarOpen ? PanelLeftCloseIcon : PanelLeftOpenIcon} />
        </HeroButton>

        <Dropdown>
          <HeroButton
            variant="ghost"
            size="sm"
            style={{ "--from-color": workspace?.color ?? "transparent" } as CSSProperties}
            className="bg-linear-to-tr from-(--from-color) via-transparent to-transparent"
          >
            {workspace?.name ?? "…"}
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

      <HeroButton
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label="Settings"
        onPress={() => {
          void navigate({ to: "/settings" });
        }}
      >
        <HugeiconsIcon icon={Setting07Icon} />
      </HeroButton>
    </div>
  );
}
