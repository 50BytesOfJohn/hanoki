import type { QueryClient } from "@tanstack/react-query";
import type { ChatInfo, MarkdownInfo } from "@shared/ipc";

import { markdownApi } from "@/api/markdown";
import { queryKeys } from "@/queries/keys";

export async function flushAttachedNotes(queryClient: QueryClient, chatId: string): Promise<void> {
  const chat = queryClient.getQueryData<ChatInfo>(queryKeys.chats.byId(chatId));
  const ids = chat?.data.settings.attachedNoteIds ?? [];
  await Promise.all(
    ids.map(async (id) => {
      const cached = queryClient.getQueryData<MarkdownInfo>(queryKeys.items.byId(id));
      try {
        if (cached?.type === "markdown") {
          await markdownApi.queueContent(id, cached.data.markdown);
        }
        await markdownApi.flushContent(id);
      } catch (error) {
        console.error(`[markdown] Failed to flush attached note "${id}" before send.`, error);
      }
    }),
  );
}
