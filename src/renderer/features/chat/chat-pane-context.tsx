import * as React from "react";

import { useWorkspaceStore } from "@/features/workspace/store";

interface ChatPaneContextValue {
  tabId: string;
  paneId: string;
  chatId: string;
}

const ChatPaneContext = React.createContext<ChatPaneContextValue | null>(null);

export function ChatPaneProvider({
  value,
  children,
}: {
  value: ChatPaneContextValue;
  children: React.ReactNode;
}) {
  return <ChatPaneContext.Provider value={value}>{children}</ChatPaneContext.Provider>;
}

export function useChatPane(): ChatPaneContextValue {
  const context = React.useContext(ChatPaneContext);
  if (!context) throw new Error("useChatPane must be used inside ChatPaneProvider.");
  return context;
}

export function useOptionalChatPane(): ChatPaneContextValue | null {
  return React.useContext(ChatPaneContext);
}

/** True when this pane is the focused pane of the active tab. Every tab/pane stays mounted, so
 * pane-scoped hotkeys must gate on this or they fire once per mounted pane. */
export function useIsActiveChatPane(): boolean {
  const pane = useOptionalChatPane();
  return useWorkspaceStore(
    (state) =>
      !pane ||
      (state.activeTabId === pane.tabId &&
        state.tabs.find((tab) => tab.id === pane.tabId)?.focusedPaneId === pane.paneId),
  );
}
