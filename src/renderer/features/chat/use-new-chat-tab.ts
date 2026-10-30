import * as React from "react";

import { useCreateChat } from "@/mutations/chats";
import { queryClient } from "@/lib/query-client";
import { getItemQueryOptions } from "@/queries/items";
import { useWorkspaceStore } from "../workspace/store";
import { getFocusedPane } from "../workspace/store/layout-tree";
import { applyItemTitleUpdate } from "../items/item-title-events";

const NEW_CHAT_TITLE = "New chat";

/**
 * Opens an empty chat in a tab of its own. An untouched new chat already sitting in the
 * preview tab is reused, so pressing the shortcut twice doesn't pile up empty chats.
 */
export function useNewChatTab() {
  const { mutate: createChat, isPending } = useCreateChat();

  return React.useCallback(() => {
    const { tabs, selectTab, workspace } = useWorkspaceStore.getState();
    if (!workspace || isPending) return;

    const previewTab = tabs.find((tab) => tab.preview);
    if (previewTab) {
      const { itemId, itemType } = getFocusedPane(previewTab);
      const item = queryClient.getQueryData(getItemQueryOptions(itemId).queryKey);
      if (itemType === "chat" && item?.title === NEW_CHAT_TITLE) {
        selectTab(previewTab.id);
        return;
      }
    }

    createChat(
      { workspaceId: workspace.id, title: NEW_CHAT_TITLE, folderId: null, newTab: true },
      {
        onSuccess: (chat) => {
          // The tree sidebar loads its children outside react-query, so a query invalidation
          // alone leaves it stale — this event is the refresh signal both sidebar modes listen to.
          applyItemTitleUpdate({
            type: "item:title-updated",
            itemId: chat.id,
            itemType: "chat",
            workspaceId: workspace.id,
            title: chat.title,
          });
        },
      },
    );
  }, [createChat, isPending]);
}
