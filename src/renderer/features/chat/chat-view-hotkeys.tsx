import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { useWorkspaceStore } from "../workspace/store";
import { useOpenChatView } from "./use-chat-view";
import { useNewChatTab } from "./use-new-chat-tab";

export function ChatViewHotkeys() {
  const openChatView = useOpenChatView();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const selectTab = useWorkspaceStore((s) => s.selectTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const focusAdjacentPane = useWorkspaceStore((s) => s.focusAdjacentPane);
  const closePane = useWorkspaceStore((s) => s.closePane);
  const reopenClosedTab = useWorkspaceStore((s) => s.reopenClosedTab);
  const openNewChat = useNewChatTab();

  const selectAdjacentTab = (delta: 1 | -1) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    selectTab(tabs[(currentIndex + delta + tabs.length) % tabs.length].id);
  };

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

  useHotkeys(
    [
      { hotkey: "Control+Tab", callback: () => selectAdjacentTab(1) },
      { hotkey: "Control+Shift+Tab", callback: () => selectAdjacentTab(-1) },
      { hotkey: "Mod+Shift+]", callback: () => selectAdjacentTab(1) },
      { hotkey: "Mod+Shift+[", callback: () => selectAdjacentTab(-1) },
    ],
    { ignoreInputs: false, enabled: tabs.length > 1 },
  );

  // Browser convention: 1-8 go to that position, 9 always goes to the last tab.
  useHotkeys(
    (["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).map((digit) => ({
      hotkey: `Mod+${digit}` as const,
      callback: () => {
        const tab = digit === "9" ? tabs.at(-1) : tabs[Number(digit) - 1];
        if (tab) selectTab(tab.id);
      },
    })),
    { ignoreInputs: false },
  );

  useHotkey("Mod+T", openNewChat, { ignoreInputs: false });
  useHotkey("Mod+Shift+T", reopenClosedTab, { ignoreInputs: false });

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
