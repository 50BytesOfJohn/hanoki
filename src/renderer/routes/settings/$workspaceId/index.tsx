import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/settings-page";

export const Route = createFileRoute("/settings/$workspaceId/")({
  component: WorkspaceSettingsGeneralPage,
});

function WorkspaceSettingsGeneralPage() {
  const { workspaceId } = Route.useParams();
  return <SettingsPage workspaceId={workspaceId} />;
}
