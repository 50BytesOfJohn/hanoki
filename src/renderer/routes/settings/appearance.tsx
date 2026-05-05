import { createFileRoute } from "@tanstack/react-router";
import { AppearancePage } from "@/features/settings/appearance-page";

export const Route = createFileRoute("/settings/appearance")({
  component: AppearancePage,
});
