import { createFileRoute } from "@tanstack/react-router";
import { CreateWorkspacePage } from "@/features/settings/create-workspace-page";

export const Route = createFileRoute("/settings/workspaces/new")({
  component: WorkspaceCreatePage,
});

function WorkspaceCreatePage() {
  return <CreateWorkspacePage />;
}
