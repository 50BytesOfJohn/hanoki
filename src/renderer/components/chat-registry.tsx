import { useChat } from "@ai-sdk/react";
import type { Chat } from "@ai-sdk/react";
import { useChatStore } from "../stores/chat-store";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";

export function ChatRegistry() {
  const chatEntries = useChatStore((s) => s.chatEntries);

  return (
    <>
      {Array.from(chatEntries.values()).map((chat) => (
        <ChatSessionKeepAlive key={chat.id} chat={chat} />
      ))}
    </>
  );
}

function ChatSessionKeepAlive({ chat }: { chat: Chat<HanokiUiMessage> }) {
  useChat({ chat });
  return null;
}
