import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { findWorkspaceById, listWorkspacesQueryOptions } from "@/queries/workspaces";

export const Route = createFileRoute("/settings/$workspaceId/$setting")({
  component: WorkspaceSettingsSectionPage,
});

function WorkspaceSettingsSectionPage() {
  const { workspaceId, setting } = Route.useParams();
  const { data: workspaces } = useQuery(listWorkspacesQueryOptions);
  const workspace = findWorkspaceById(workspaces, workspaceId);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{setting}</h1>
      <p className="text-muted-foreground">
        Settings section "{setting}" for {workspace?.name ?? `workspace "${workspaceId}"`}.
      </p>
    </div>
  );
}
