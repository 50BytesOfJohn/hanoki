import type { ChatInfo } from "@shared/ipc";
import type { ChatTitleUpdatedEvent } from "@shared/events";

import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";

const CHAT_TITLE_UPDATED_BROWSER_EVENT = "hanoki:chat-title-updated";

export function applyChatTitleUpdate(event: ChatTitleUpdatedEvent): void {
  queryClient.setQueryData<ChatInfo>(queryKeys.chats.byId(event.chatId), (current) =>
    current
      ? {
          ...current,
          title: event.title,
          updatedAt: Date.now(),
        }
      : current,
  );
  queryClient.setQueryData<ChatInfo>(queryKeys.items.byId(event.chatId), (current) =>
    current ? { ...current, title: event.title, updatedAt: Date.now() } : current,
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.chats.pinnedBranches(),
    exact: true,
  });

  window.dispatchEvent(
    new CustomEvent<ChatTitleUpdatedEvent>(CHAT_TITLE_UPDATED_BROWSER_EVENT, {
      detail: event,
    }),
  );
}

export function subscribeToChatTitleUpdates(
  callback: (event: ChatTitleUpdatedEvent) => void,
): () => void {
  const listener = (event: Event) => {
    callback((event as CustomEvent<ChatTitleUpdatedEvent>).detail);
  };

  window.addEventListener(CHAT_TITLE_UPDATED_BROWSER_EVENT, listener);
  return () => window.removeEventListener(CHAT_TITLE_UPDATED_BROWSER_EVENT, listener);
}
