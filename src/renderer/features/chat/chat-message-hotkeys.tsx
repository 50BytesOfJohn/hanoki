import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";

import {
  useChatGetMessages,
  useChatIsInteractionLocked,
  useChatIsRevisionComposerOpen,
  useChatRegenerateMessage,
  useChatSwitchBranch,
} from "@/features/chat/chat-context";
import { useIsActiveChatPane } from "@/features/chat/chat-pane-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";

/** Cmd+[ / Cmd+] read as back/forward on macOS and are unbound in the composer. */
export const BRANCH_SWITCH_HOTKEYS = {
  previous: "Mod+[",
  next: "Mod+]",
} as const;

export function ChatMessageHotkeys() {
  const getMessages = useChatGetMessages();
  const regenerateMessage = useChatRegenerateMessage();
  const switchBranch = useChatSwitchBranch();
  const isInteractionLocked = useChatIsInteractionLocked();
  const isRevisionComposerOpen = useChatIsRevisionComposerOpen();
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

      // Cmd+R while typing a note would regenerate without it.
      if (isInteractionLocked || isRevisionComposerOpen || !latestAssistantMessageId) {
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

  // Switches the branch point closest to the end of the chat, i.e. the latest
  // message that has siblings, mirroring its toolbar arrows.
  const switchLatestBranch = (event: KeyboardEvent, step: -1 | 1) => {
    event.preventDefault();
    // Holding the key would race the async switch against stale messages.
    if (isInteractionLocked || event.repeat) return;

    const messages = getMessages();
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const siblings = messages[index].metadata?.siblings ?? [];
      if (siblings.length < 2) continue;

      const targetId = siblings[(messages[index].metadata?.siblingIndex ?? 0) + step];
      if (targetId) void switchBranch(targetId);
      return;
    }
  };

  useHotkeys(
    [
      {
        hotkey: BRANCH_SWITCH_HOTKEYS.previous,
        callback: (event) => switchLatestBranch(event, -1),
      },
      {
        hotkey: BRANCH_SWITCH_HOTKEYS.next,
        callback: (event) => switchLatestBranch(event, 1),
      },
    ],
    {
      enabled: isActivePane,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      // macOS sends no keyup for `]` while Cmd is held, so a reset would
      // demand releasing Cmd between presses.
      requireReset: false,
    },
  );

  return null;
}
