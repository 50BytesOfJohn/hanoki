import { createFileRoute } from "@tanstack/react-router";
import { SumiPage } from "@/features/settings/sumi-page";

export const Route = createFileRoute("/settings/sumi")({
  component: SumiPage,
});
