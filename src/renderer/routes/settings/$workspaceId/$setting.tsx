import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsPageHeader, SettingsPageShell } from "@/features/settings/settings-ui";
import { findWorkspaceById, listWorkspacesQueryOptions } from "@/queries/workspaces";

export const Route = createFileRoute("/settings/$workspaceId/$setting")({
  component: WorkspaceSettingsSectionPage,
});

function WorkspaceSettingsSectionPage() {
  const { workspaceId, setting } = Route.useParams();
  const { data: workspaces } = useQuery(listWorkspacesQueryOptions);
  const workspace = findWorkspaceById(workspaces, workspaceId);

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title={setting}
        description={`Settings section "${setting}" for ${workspace?.name ?? `workspace "${workspaceId}"`}.`}
      />
    </SettingsPageShell>
  );
}
