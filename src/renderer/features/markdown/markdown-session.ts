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

interface MarkdownEditorBinding {
  editor: Editor;
  resetBaseline: () => void;
}

const savers = new Map<string, MarkdownSaver>();
const editors = new Map<string, MarkdownEditorBinding>();
let listening = false;

export function registerMarkdownSaver(itemId: string, saver: MarkdownSaver): () => void {
  savers.set(itemId, saver);
  ensureRewriteListener();
  return () => {
    if (savers.get(itemId) === saver) savers.delete(itemId);
  };
}

export function registerMarkdownEditor(
  itemId: string,
  editor: Editor,
  resetBaseline: () => void,
): () => void {
  const binding = { editor, resetBaseline };
  editors.set(itemId, binding);
  ensureRewriteListener();
  return () => {
    if (editors.get(itemId) === binding) editors.delete(itemId);
  };
}

export function registeredMarkdownEditor(itemId: string): Editor | undefined {
  return editors.get(itemId)?.editor;
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
      const binding = editors.get(itemId);
      if (binding) {
        binding.editor
          .chain()
          .command(({ tr }) => {
            tr.setMeta("addToHistory", false);
            return true;
          })
          .setContent(markdown, { contentType: "markdown", emitUpdate: false })
          .run();
        binding.resetBaseline();
      }
      saver?.adopt(markdown);
      queryClient.setQueryData<MarkdownInfo>(queryKeys.items.byId(itemId), (current) =>
        current?.type === "markdown"
          ? { ...current, data: { ...current.data, markdown } }
          : current,
      );
    }),
  );
}
