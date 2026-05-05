import { createFileRoute } from "@tanstack/react-router";
import { ChatSettingsPage } from "@/features/chat/chat-settings-page";

export const Route = createFileRoute("/chat/settings")({
  component: ChatSettingsPage,
});
