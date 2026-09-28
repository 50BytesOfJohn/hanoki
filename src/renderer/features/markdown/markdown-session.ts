import type { Editor } from "@tiptap/core";
import type { MarkdownInfo } from "@shared/ipc";

import { itemsApi } from "@/api/items";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries/keys";
import { subscribeToMarkdownRewrites } from "@/features/items/item-title-events";

interface MarkdownSaver {
  flush: () => Promise<unknown>;
  cancel: () => void;
  adopt: (markdown: string) => void;
}

const savers = new Map<string, MarkdownSaver>();
const editors = new Map<string, Editor>();
let listening = false;

export function registerMarkdownSaver(itemId: string, saver: MarkdownSaver): () => void {
  savers.set(itemId, saver);
  ensureRewriteListener();
  return () => {
    if (savers.get(itemId) === saver) savers.delete(itemId);
  };
}

export function registerMarkdownEditor(itemId: string, editor: Editor): () => void {
  editors.set(itemId, editor);
  ensureRewriteListener();
  return () => {
    if (editors.get(itemId) === editor) editors.delete(itemId);
  };
}

export async function flushOpenMarkdownEditors(): Promise<void> {
  await Promise.all([...savers.values()].map((saver) => saver.flush()));
}

function ensureRewriteListener(): void {
  if (listening) return;
  listening = true;
  subscribeToMarkdownRewrites((itemIds) => {
    void adoptRewrittenMarkdown(itemIds);
  });
}

async function adoptRewrittenMarkdown(itemIds: readonly string[]): Promise<void> {
  await Promise.all(
    itemIds.map(async (itemId) => {
      const saver = savers.get(itemId);
      saver?.cancel();
      const fresh = await itemsApi.get(itemId);
      if (fresh.type !== "markdown") return;
      const markdown = fresh.data.markdown;
      editors
        .get(itemId)
        ?.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
      saver?.adopt(markdown);
      queryClient.setQueryData<MarkdownInfo>(queryKeys.items.byId(itemId), (current) =>
        current?.type === "markdown"
          ? { ...current, data: { ...current.data, markdown } }
          : current,
      );
    }),
  );
}
