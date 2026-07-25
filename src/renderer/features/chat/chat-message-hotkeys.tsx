import { useHotkey } from "@tanstack/react-hotkeys";

import {
  useChatGetMessages,
  useChatIsInteractionLocked,
  useChatRegenerateMessage,
} from "@/features/chat/chat-context";
import { useIsActiveChatPane } from "@/features/chat/chat-pane-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";

export function ChatMessageHotkeys() {
  const getMessages = useChatGetMessages();
  const regenerateMessage = useChatRegenerateMessage();
  const isInteractionLocked = useChatIsInteractionLocked();
  const scrollToBottom = useChatScrollToBottom();
  const isActivePane = useIsActiveChatPane();

  useHotkey(
    "Mod+R",
    (event) => {
      event.preventDefault();

      const messages = getMessages();
      let latestAssistantMessageId: string | null = null;

      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === "assistant") {
          latestAssistantMessageId = messages[index].id;
          break;
        }
      }

      if (isInteractionLocked || !latestAssistantMessageId) {
        return;
      }

      scrollToBottom();
      void regenerateMessage({ messageId: latestAssistantMessageId });
    },
    {
      enabled: isActivePane,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
    },
  );

  return null;
}
