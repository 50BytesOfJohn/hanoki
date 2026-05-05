import * as React from "react";

const ChatScrollToBottomContext = React.createContext<(() => void) | null>(null);

interface ChatScrollToBottomProviderProps {
  children: React.ReactNode;
  scrollToBottom: () => void;
}

export function ChatScrollToBottomProvider({
  children,
  scrollToBottom,
}: ChatScrollToBottomProviderProps) {
  return (
    <ChatScrollToBottomContext.Provider value={scrollToBottom}>
      {children}
    </ChatScrollToBottomContext.Provider>
  );
}

export function useChatScrollToBottom() {
  const context = React.useContext(ChatScrollToBottomContext);

  if (!context) {
    throw new Error("Chat scroll context is not available");
  }

  return context;
}
