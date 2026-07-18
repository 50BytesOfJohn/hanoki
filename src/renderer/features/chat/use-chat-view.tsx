import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceStore } from "../workspace/store";

export const CHAT_VIEW_PATHS = [
  "/chat",
  "/chat/graph",
  "/chat/pinned-branches",
  "/chat/settings",
] as const;

export type ChatViewPath = (typeof CHAT_VIEW_PATHS)[number];

function isChatViewPath(value: string | undefined): value is ChatViewPath {
  return CHAT_VIEW_PATHS.includes(value as ChatViewPath);
}

/** Navigate to a chat view and remember it for the current chat. */
export function useOpenChatView() {
  const navigate = useNavigate();

  return React.useCallback(
    (view: ChatViewPath) => {
      const { currentChatId, setChatView } = useWorkspaceStore.getState();

      if (currentChatId) {
        setChatView(currentChatId, view);
      }

      void navigate({ to: view });
    },
    [navigate],
  );
}

/** Restores the chat's last-used view (default: conversation) whenever the active chat changes. */
export function ChatViewRestore() {
  const navigate = useNavigate();
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);

  React.useEffect(() => {
    if (!currentChatId) {
      return;
    }

    const savedView = useWorkspaceStore.getState().chatViews[currentChatId];
    void navigate({ to: isChatViewPath(savedView) ? savedView : "/chat" });
  }, [currentChatId, navigate]);

  return null;
}
