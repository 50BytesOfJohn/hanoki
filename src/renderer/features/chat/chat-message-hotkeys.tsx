import * as React from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

import {
  useChatIsInteractionLocked,
  useChatMessages,
  useChatRegenerateMessage,
} from "@/features/chat/chat-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";

export function ChatMessageHotkeys() {
  const messages = useChatMessages();
  const regenerateMessage = useChatRegenerateMessage();
  const isInteractionLocked = useChatIsInteractionLocked();
  const scrollToBottom = useChatScrollToBottom();
  const latestAssistantMessageId = React.useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];

      if (message.role === "assistant") {
        return message.id;
      }
    }

    return null;
  }, [messages]);

  useHotkey(
    "Mod+R",
    (event) => {
      event.preventDefault();

      if (isInteractionLocked || !latestAssistantMessageId) {
        return;
      }

      scrollToBottom();
      void regenerateMessage({ messageId: latestAssistantMessageId });
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  return null;
}
