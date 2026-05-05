import { createFileRoute } from "@tanstack/react-router";
import { ChatGraphPage } from "@/features/chat/modules/graph/chat-graph-page";

export const Route = createFileRoute("/chat/graph")({
  component: ChatGraphPage,
});
