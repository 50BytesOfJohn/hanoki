import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { useOpenChatView } from "./use-chat-view";

export function ChatViewHotkeys() {
  const openChatView = useOpenChatView();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const selectTab = useWorkspaceStore((s) => s.selectTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const focusAdjacentPane = useWorkspaceStore((s) => s.focusAdjacentPane);
  const closePane = useWorkspaceStore((s) => s.closePane);

  const focusChatInput = (event: KeyboardEvent) => {
    if (event.isComposing || document.querySelector('[role="dialog"]')) return;

    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab) return;

    const pane = document.querySelector<HTMLElement>(
      `[data-pane-id="${CSS.escape(activeTab.focusedPaneId)}"]`,
    );
    const composer = pane?.querySelector<HTMLElement>(
      '[data-chat-composer-input="true"] [contenteditable="true"]',
    );
    if (!composer) return;

    event.preventDefault();
    event.stopPropagation();
    composer.focus({ preventScroll: true });
  };

  useHotkeys(
    [
      { hotkey: "Mod+L", callback: focusChatInput },
      { hotkey: "Shift+Escape", callback: focusChatInput },
    ],
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      requireReset: true,
      meta: {
        name: "Focus chat input",
        description: "Focus the prompt in the active chat pane",
      },
    },
  );

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
      const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
      const nextIndex = (currentIndex + 1) % tabs.length;
      selectTab(tabs[nextIndex].id);
    },
    { ignoreInputs: false },
  );

  useHotkey(
    "Control+Shift+Tab",
    (event) => {
      if (tabs.length < 2) return;
      event.preventDefault();
      const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      selectTab(tabs[prevIndex].id);
    },
    { ignoreInputs: false },
  );

  useHotkey(
    "Mod+W",
    (event) => {
      event.preventDefault();
      if (activeTabId) closeTab(activeTabId);
    },
    { ignoreInputs: false },
  );

  useHotkey("Mod+Alt+ArrowLeft", (event) => {
    event.preventDefault();
    focusAdjacentPane("left");
  });
  useHotkey("Mod+Alt+ArrowRight", (event) => {
    event.preventDefault();
    focusAdjacentPane("right");
  });
  useHotkey("Mod+Alt+ArrowUp", (event) => {
    event.preventDefault();
    focusAdjacentPane("up");
  });
  useHotkey("Mod+Alt+ArrowDown", (event) => {
    event.preventDefault();
    focusAdjacentPane("down");
  });
  useHotkey("Mod+Shift+W", (event) => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (!activeTab) return;
    event.preventDefault();
    closePane(activeTab.id, activeTab.focusedPaneId);
  });

  return null;
}
