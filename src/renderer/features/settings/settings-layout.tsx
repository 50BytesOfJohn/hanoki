import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  Add01Icon,
  ArrowLeft01Icon,
  CircleIcon,
  PaintBrush02Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WindowChrome } from "@/components/app/window-chrome";
import { Button } from "@/components/ui/button";
import { getProviderIconById } from "@/lib/provider-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { listProvidersQueryOptions } from "@/queries/providers";
import { listWorkspacesQueryOptions } from "@/queries/workspaces";

const globalNavItems = [
  {
    to: "/settings",
    label: "General",
    icon: SlidersHorizontalIcon,
    exact: true,
  },
  { to: "/settings/appearance", label: "Appearance", icon: PaintBrush02Icon },
] as const;

export function SettingsLayout() {
  const matchRoute = useMatchRoute();
  const { data: workspaces = [] } = useQuery(listWorkspacesQueryOptions);
  const { data: providers = [] } = useQuery(listProvidersQueryOptions);
  const hasWorkspaces = workspaces.length > 0;
  const hasProviders = providers.length > 0;

  return (
    <WindowChrome
      toolbar={
        <div className="flex w-full items-center justify-between gap-3">
          <Button size="sm" variant="ghost" render={<Link to="/chat" />}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
            <span>Chat</span>
          </Button>
          <div className="font-heading text-sm font-semibold tracking-tight">Settings</div>
          <div className="w-14" />
        </div>
      }
      contentClassName="overflow-hidden"
    >
      <SidebarProvider className="h-full min-h-0">
        <Sidebar collapsible="none" className="shrink-0">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Global</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {globalNavItems.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={Boolean(
                          matchRoute({
                            to: item.to,
                            fuzzy: !("exact" in item),
                          }),
                        )}
                        render={<Link to={item.to} activeOptions={{ exact: "exact" in item }} />}
                      >
                        <HugeiconsIcon icon={item.icon} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="justify-between gap-2">
                <span>Workspaces</span>
                <Button size="xs" variant="ghost" render={<Link to="/settings/workspaces/new" />}>
                  <HugeiconsIcon icon={Add01Icon} />
                  <span>New</span>
                </Button>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {hasWorkspaces ? (
                  <SidebarMenu>
                    {workspaces.map((workspace) => (
                      <SidebarMenuItem key={workspace.id}>
                        <SidebarMenuButton
                          isActive={Boolean(
                            matchRoute({
                              to: "/settings/$workspaceId",
                              params: { workspaceId: workspace.id },
                              fuzzy: true,
                            }),
                          )}
                          render={
                            <Link
                              to="/settings/$workspaceId"
                              params={{ workspaceId: workspace.id }}
                            />
                          }
                        >
                          <HugeiconsIcon
                            icon={CircleIcon}
                            color={workspace.color ?? "current"}
                            fill={workspace.color ?? "current"}
                          />
                          <span>{workspace.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                ) : (
                  <p className="px-2 py-1 text-sidebar-foreground/70 text-xs">
                    No workspaces found.
                  </p>
                )}
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="justify-between gap-2">
                <span>Providers</span>
                <Button size="xs" variant="ghost" render={<Link to="/settings/providers/new" />}>
                  <HugeiconsIcon icon={Add01Icon} />
                  <span>New</span>
                </Button>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {hasProviders ? (
                  <SidebarMenu>
                    {providers.map((provider) => {
                      const ProviderIcon = getProviderIconById(provider.catalogId);

                      return (
                        <SidebarMenuItem key={provider.id}>
                          <SidebarMenuButton
                            isActive={Boolean(
                              matchRoute({
                                to: "/settings/providers/$providerId",
                                params: { providerId: provider.id },
                                fuzzy: true,
                              }),
                            )}
                            render={
                              <Link
                                to="/settings/providers/$providerId"
                                params={{ providerId: provider.id }}
                              />
                            }
                          >
                            <ProviderIcon />
                            <span>{provider.displayName}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                ) : (
                  <p className="px-2 py-1 text-sidebar-foreground/70 text-xs">
                    No providers found.
                  </p>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <Outlet />
      </SidebarProvider>
    </WindowChrome>
  );
}
