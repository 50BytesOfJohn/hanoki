import { createFileRoute } from "@tanstack/react-router";
import { ChatLayout } from "@/features/chat/chat-layout";

export interface ChatSearchParams {
  graphMessageId?: string;
  tabChatId?: string;
}

export const Route = createFileRoute("/chat")({
  component: ChatLayout,
  validateSearch: (search: Record<string, unknown>): ChatSearchParams => ({
    graphMessageId: typeof search.graphMessageId === "string" ? search.graphMessageId : undefined,
    tabChatId: typeof search.tabChatId === "string" ? search.tabChatId : undefined,
  }),
});
