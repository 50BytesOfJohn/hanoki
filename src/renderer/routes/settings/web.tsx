import { createFileRoute } from "@tanstack/react-router";
import { WebPage } from "@/features/settings/web-page";

export const Route = createFileRoute("/settings/web")({
  component: WebPage,
});
