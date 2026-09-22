import type { ItemTitleUpdatedEvent } from "@shared/events";
import type { ChatInfo, ItemInfo } from "@shared/ipc";

import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";

const titleUpdateSubscribers = new Set<(event: ItemTitleUpdatedEvent) => void>();
const chatTreeChangeSubscribers = new Set<(workspaceId: string) => void>();

export function notifyChatTreeChanged(workspaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
  for (const subscriber of chatTreeChangeSubscribers) subscriber(workspaceId);
}

export function applyItemTitleUpdate(event: ItemTitleUpdatedEvent): void {
  queryClient.setQueryData<ItemInfo>(queryKeys.items.byId(event.itemId), (current) =>
    current ? { ...current, title: event.title, updatedAt: Date.now() } : current,
  );
  if (event.itemType === "chat") {
    queryClient.setQueryData<ChatInfo>(queryKeys.chats.byId(event.itemId), (current) =>
      current ? { ...current, title: event.title, updatedAt: Date.now() } : current,
    );
    void queryClient.invalidateQueries({
      queryKey: queryKeys.chats.pinnedBranches(),
      exact: true,
    });
  }
  notifyChatTreeChanged(event.workspaceId);

  for (const subscriber of titleUpdateSubscribers) subscriber(event);
}

export function subscribeToItemTitleUpdates(
  callback: (event: ItemTitleUpdatedEvent) => void,
): () => void {
  titleUpdateSubscribers.add(callback);
  return () => titleUpdateSubscribers.delete(callback);
}

export function subscribeToChatTreeChanges(callback: (workspaceId: string) => void): () => void {
  chatTreeChangeSubscribers.add(callback);
  return () => chatTreeChangeSubscribers.delete(callback);
}
