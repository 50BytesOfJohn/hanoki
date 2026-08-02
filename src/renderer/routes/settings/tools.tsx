import { createFileRoute } from "@tanstack/react-router";
import { ToolsPage } from "@/features/settings/tools-page";

export const Route = createFileRoute("/settings/tools")({
  component: ToolsPage,
});
