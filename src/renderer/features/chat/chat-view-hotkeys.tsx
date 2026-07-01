import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceStore } from "../workspace/store";

export function ChatViewHotkeys() {
  const navigate = useNavigate();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);
  const setCurrentChat = useWorkspaceStore((s) => s.setCurrentChat);

  useHotkey("Mod+Shift+C", (event) => {
    event.preventDefault();
    void navigate({ to: "/chat" });
  });

  useHotkey("Mod+Shift+G", (event) => {
    event.preventDefault();
    void navigate({ to: "/chat/graph" });
  });

  useHotkey("Mod+Shift+S", (event) => {
    event.preventDefault();
    void navigate({ to: "/chat/settings" });
  });

  useHotkey(
    "Ctrl+Tab",
    (event) => {
      if (tabs.length < 2) return;
      event.preventDefault();
      const currentIndex = tabs.findIndex((t) => t.chatId === currentChatId);
      const nextIndex = (currentIndex + 1) % tabs.length;
      setCurrentChat(tabs[nextIndex].chatId);
    },
    { ignoreInputs: true },
  );

  useHotkey(
    "Ctrl+Shift+Tab",
    (event) => {
      if (tabs.length < 2) return;
      event.preventDefault();
      const currentIndex = tabs.findIndex((t) => t.chatId === currentChatId);
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setCurrentChat(tabs[prevIndex].chatId);
    },
    { ignoreInputs: true },
  );

  return null;
}
