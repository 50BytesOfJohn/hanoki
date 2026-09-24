import { messagesApi } from "@/api/messages";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { useSystemStore } from "@/stores/system-store";
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

/** Starts one reply for a draft saved in another chat. Does not open a pane. */
export function startRequestedChatGeneration(chatId: string, modelId: string): void {
  const port = useSystemStore.getState().aiServer.port;
  if (!port) return;

  const chat = useChatStore.getState().getOrCreateChat(chatId, `http://127.0.0.1:${port}/api/chat`);
  if (chat.status === "streaming" || chat.status === "submitted") return;

  void messagesApi.listMessages(chatId).then((messages) => {
    const current = useChatStore.getState().chatEntries.get(chatId);
    if (!current || current.status === "streaming" || current.status === "submitted") return;
    current.messages = messages;
    void current.sendMessage(undefined, { body: { modelId } });
  });
}
