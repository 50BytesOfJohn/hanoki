import { useWorkspaceStore } from "@/features/workspace/store";
import { getFocusedPane } from "@/features/workspace/store/layout-tree";
import { useChatStore } from "./chat-store";

/*
 * A chat that is generating is never temporary, however the run started: the composer,
 * a retry, a resumed approval, or simply opening a chat that is already streaming.
 * Both sources are plain zustand stores, so importing this module is the whole wiring.
 */

function keepGeneratingPreviewTab() {
  const { tabs, keepTab } = useWorkspaceStore.getState();
  const tab = tabs.find((candidate) => candidate.preview);
  if (!tab) return;
  const pane = getFocusedPane(tab);
  if (pane.itemType !== "chat") return;
  const status = useChatStore.getState().chatEntries.get(pane.itemId)?.status;
  if (status === "submitted" || status === "streaming") keepTab(tab.id);
}

const trackedChatIds = new Set<string>();

function trackNewChats(chatEntries: ReturnType<typeof useChatStore.getState>["chatEntries"]) {
  for (const [chatId, chat] of chatEntries) {
    if (trackedChatIds.has(chatId)) continue;
    trackedChatIds.add(chatId);
    // Chats are never evicted from the chat store, so the unsubscribe is never needed.
    chat["~registerStatusCallback"](keepGeneratingPreviewTab);
  }
  keepGeneratingPreviewTab();
}

trackNewChats(useChatStore.getState().chatEntries);
useChatStore.subscribe((state) => trackNewChats(state.chatEntries));

useWorkspaceStore.subscribe((state) => {
  const tab = state.tabs.find((candidate) => candidate.preview);
  return tab ? getFocusedPane(tab).itemId : null;
}, keepGeneratingPreviewTab);
