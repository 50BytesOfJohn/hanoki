import * as React from "react";
import { create } from "zustand";

import { useWorkspaceStore } from "@/features/workspace/store";
import { getPanes } from "@/features/workspace/store/layout-tree";
import type { WorkspaceStoreState } from "@/features/workspace/store/types";
import {
  applyChatStatus,
  markRead,
  sortActivity,
  type ChatActivityEntries,
  type ChatActivityEntry,
} from "./chat-activity";
import { useChatStore } from "./chat-store";

export type { ChatActivityEntry, ChatActivityKind } from "./chat-activity";

interface ChatActivityState {
  entries: ChatActivityEntries;
  /** Clears every unread chat in a workspace. Working chats keep counting. */
  markWorkspaceRead: (workspaceId: string) => void;
}

export const useChatActivityStore = create<ChatActivityState>((set) => ({
  entries: {},

  markWorkspaceRead: (workspaceId) => {
    set((state) => ({
      entries: markRead(
        state.entries,
        Object.values(state.entries)
          .filter((entry) => entry.workspaceId === workspaceId)
          .map((entry) => entry.chatId),
      ),
    }));
  },
}));

/** Activity for one workspace, ordered for display. */
export function useWorkspaceChatActivity(workspaceId: string | null): ChatActivityEntry[] {
  const entries = useChatActivityStore((state) => state.entries);

  return React.useMemo(
    () =>
      workspaceId
        ? sortActivity(Object.values(entries).filter((entry) => entry.workspaceId === workspaceId))
        : [],
    [entries, workspaceId],
  );
}

/** Chats the user can actually see: every pane of the active tab. */
function visibleChatIds(state: WorkspaceStoreState): string[] {
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  // ponytail: a backgrounded window still counts as "visible". Add an OS focus check if that bites.
  return activeTab ? getPanes(activeTab.layout).map((pane) => pane.chatId) : [];
}

/* ── Wiring ──
 * Both sources are plain zustand stores, so tracking needs no component: importing this
 * module is enough, and the panel imports it whether or not the setting is on. */

const trackedChatIds = new Set<string>();

function trackNewChats(chatEntries: ReturnType<typeof useChatStore.getState>["chatEntries"]) {
  for (const [chatId, chat] of chatEntries) {
    if (trackedChatIds.has(chatId)) continue;
    trackedChatIds.add(chatId);
    // Chats are never evicted from the chat store, so the unsubscribe is never needed.
    chat["~registerStatusCallback"](() => {
      const workspace = useWorkspaceStore.getState();
      // A run always belongs to the workspace it started in, even if the user switches away.
      if (!workspace.workspace) return;
      useChatActivityStore.setState((state) => ({
        entries: applyChatStatus(state.entries, {
          chatId,
          workspaceId: workspace.workspace!.id,
          status: chat.status,
          isVisible: visibleChatIds(workspace).includes(chatId),
          at: Date.now(),
        }),
      }));
    });
  }
}

trackNewChats(useChatStore.getState().chatEntries);
useChatStore.subscribe((state) => trackNewChats(state.chatEntries));

// Looking at a chat marks it read — covers tab selection, pane moves and workspace switches.
useWorkspaceStore.subscribe((state) => {
  const visible = visibleChatIds(state);
  if (visible.length === 0) return;
  useChatActivityStore.setState((activity) => ({ entries: markRead(activity.entries, visible) }));
});
