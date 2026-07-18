import { useHotkey } from "@tanstack/react-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { useOpenChatView } from "./use-chat-view";

export function ChatViewHotkeys() {
  const openChatView = useOpenChatView();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);
  const setCurrentChat = useWorkspaceStore((s) => s.setCurrentChat);

  useHotkey("Mod+Shift+C", (event) => {
    event.preventDefault();
    openChatView("/chat");
  });

  useHotkey("Mod+Shift+G", (event) => {
    event.preventDefault();
    openChatView("/chat/graph");
  });

  useHotkey("Mod+Shift+S", (event) => {
    event.preventDefault();
    openChatView("/chat/settings");
  });

  useHotkey(
    "Control+Tab",
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
    "Control+Shift+Tab",
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
