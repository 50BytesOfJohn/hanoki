import { useQuery } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { activeWorkspaceQueryOptions, listWorkspacesQueryOptions } from "@/queries/workspaces";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useQuery(listWorkspacesQueryOptions);
  useQuery(activeWorkspaceQueryOptions);

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col">
        <Outlet />
      </div>
    </TooltipProvider>
  );
}
