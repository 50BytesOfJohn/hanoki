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
    <div className="mx-auto w-full max-w-2xl space-y-4 px-6 py-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">{setting}</h1>
      <p className="text-sm text-muted-foreground">
        Settings section "{setting}" for {workspace?.name ?? `workspace "${workspaceId}"`}.
      </p>
    </div>
  );
}
