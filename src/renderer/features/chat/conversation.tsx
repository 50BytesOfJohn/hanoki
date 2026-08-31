import * as React from "react";
import { CatchBoundary } from "@tanstack/react-router";

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
          <MessageErrorBoundary
            key={message.id}
            messageId={message.id}
            resetKey={`${message.id}:${message.parts.length}`}
          >
            <ChatMessage
              chatId={chatId}
              isAnimating={animatingMessageId === message.id}
              isEditing={editingMessageId === message.id}
              isInteractionLocked={isInteractionLocked}
              message={message}
              modelId={modelId}
            />
          </MessageErrorBoundary>
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

interface MessageErrorBoundaryProps {
  children: React.ReactNode;
  messageId: string;
  resetKey: string;
}

/** A malformed message must not take down the whole chat route, only its own bubble. */
export function MessageErrorBoundary({ children, messageId, resetKey }: MessageErrorBoundaryProps) {
  return (
    <CatchBoundary
      getResetKey={() => resetKey}
      errorComponent={MessageRenderError}
      onCatch={(renderError) => {
        console.error(`[chat] Failed to render message "${messageId}".`, renderError);
      }}
    >
      {children}
    </CatchBoundary>
  );
}

function MessageRenderError({ error }: { error: Error }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
      This message could not be displayed. {error.message}
    </div>
  );
}
