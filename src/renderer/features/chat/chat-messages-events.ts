import { messagesApi } from "@/api/messages";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { useChatStore } from "@/stores/chat-store";

function isChatBusy(chatId: string) {
  const status = useChatStore.getState().chatEntries.get(chatId)?.status;
  return status === "streaming" || status === "submitted";
}

/** Refresh cached transcripts after a draft is saved in main. */
export function notifyChatMessagesChanged(chatId: string): void {
  void queryClient.invalidateQueries({
    queryKey: [...queryKeys.chats.all, "messages", chatId],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.chats.allMessages(chatId),
  });

  if (isChatBusy(chatId)) return;

  void messagesApi.listMessages(chatId).then((messages) => {
    const chat = useChatStore.getState().chatEntries.get(chatId);
    if (!chat || isChatBusy(chatId)) return;
    chat.messages = messages;
  });
}
