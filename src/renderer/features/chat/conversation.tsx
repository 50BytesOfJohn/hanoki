import * as React from "react";

import {
  useChatContinuingMessageId,
  useChatError,
  useChatHistoryError,
  useChatId,
  useChatIsBusy,
  useChatIsInteractionLocked,
  useChatMessages,
  useChatModelId,
  useChatEditingMessageId,
} from "@/features/chat/chat-context";

import { ChatMessage } from "./message";

export function Conversation() {
  const chatId = useChatId();
  const messages = useChatMessages();
  const modelId = useChatModelId();
  const editingMessageId = useChatEditingMessageId();
  const continuingMessageId = useChatContinuingMessageId();
  const isBusy = useChatIsBusy();
  const isInteractionLocked = useChatIsInteractionLocked();
  const historyError = useChatHistoryError();
  const error = useChatError();
  const lastMessage = messages.at(-1) ?? null;
  const animatingMessageId =
    continuingMessageId ?? (isBusy && lastMessage?.role === "assistant" ? lastMessage.id : null);

  return (
    <div className="min-h-0 flex flex-col gap-8 w-full max-w-3xl mx-auto px-6 pt-8">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Send a message to start chatting.</p>
      ) : (
        messages.map((message) => (
          <ChatMessage
            key={message.id}
            chatId={chatId}
            isAnimating={animatingMessageId === message.id}
            isEditing={editingMessageId === message.id}
            isInteractionLocked={isInteractionLocked}
            message={message}
            modelId={modelId}
          />
        ))
      )}

      {historyError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {historyError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error.message}
        </div>
      ) : null}
    </div>
  );
}
