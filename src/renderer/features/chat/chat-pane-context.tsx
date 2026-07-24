import * as React from "react";

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
