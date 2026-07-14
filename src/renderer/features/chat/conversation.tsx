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
import { cn } from "@/lib/utils";

import hanokiLogoUrl from "../../../../assets/logo.png";
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
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-3xl flex-col gap-8 px-6",
        messages.length === 0 ? "flex-1 items-center justify-center" : "pt-8",
      )}
    >
      {messages.length === 0 ? (
        <img
          src={hanokiLogoUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-72 shrink-0 select-none"
        />
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
