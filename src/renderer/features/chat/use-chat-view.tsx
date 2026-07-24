import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceStore } from "../workspace/store";
import { useOptionalChatPane } from "./chat-pane-context";

export const CHAT_VIEW_PATHS = [
  "/chat",
  "/chat/graph",
  "/chat/pinned-branches",
  "/chat/settings",
] as const;

export type ChatViewPath = (typeof CHAT_VIEW_PATHS)[number];

/** Navigate to a chat view and remember it for the current chat. */
export function useOpenChatView() {
  const navigate = useNavigate();
  const pane = useOptionalChatPane();

  return React.useCallback(
    (view: ChatViewPath) => {
      const { activeTabId, tabs, setPaneView } = useWorkspaceStore.getState();
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      const target =
        pane ??
        (activeTab ? { tabId: activeTab.id, paneId: activeTab.focusedPaneId, chatId: "" } : null);
      if (target) {
        setPaneView(target.tabId, target.paneId, view);
        void navigate({ to: "/chat" });
        return;
      }
      void navigate({ to: view });
    },
    [navigate, pane],
  );
}
