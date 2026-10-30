import * as React from "react";

interface ScrollActions {
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

interface ChatScrollActionsContextValue {
  scrollActions: ScrollActions | null;
  registerScrollActions: (actions: ScrollActions | null) => void;
}

const ChatScrollActionsContext = React.createContext<ChatScrollActionsContextValue>({
  scrollActions: null,
  registerScrollActions: () => {},
});

export function ChatScrollActionsProvider({ children }: { children: React.ReactNode }) {
  const [scrollActions, setScrollActions] = React.useState<ScrollActions | null>(null);

  const registerScrollActions = React.useCallback((actions: ScrollActions | null) => {
    setScrollActions(actions ? { ...actions } : null);
  }, []);

  const value = React.useMemo(
    () => ({ scrollActions, registerScrollActions }),
    [scrollActions, registerScrollActions],
  );

  return (
    <ChatScrollActionsContext.Provider value={value}>{children}</ChatScrollActionsContext.Provider>
  );
}

export function useChatScrollActions() {
  return React.useContext(ChatScrollActionsContext);
}
