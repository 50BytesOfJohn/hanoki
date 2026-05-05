import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";

export function ChatViewHotkeys() {
  const navigate = useNavigate();

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

  return null;
}
