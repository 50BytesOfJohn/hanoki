import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAsyncDebouncer } from "@tanstack/react-pacer";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileScriptIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ItemInfo, MarkdownInfo } from "@shared/ipc";
import { DEFAULT_MARKDOWN_TITLE } from "@shared/markdown/title-source";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toastManager } from "@/components/ui/toast";
import { markdownApi } from "@/api/markdown";
import { generateSumiItemTitle } from "@/features/items/sumi-item-title-generation";
import { useFlushMarkdownContent } from "@/mutations/markdown";
import { getItemQueryOptions } from "@/queries/items";
import { queryKeys } from "@/queries/keys";
import { sumiSettingsQueryOptions } from "@/queries/settings";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";

export const MARKDOWN_MODES = {
  preview: { label: "Preview", description: "Formatted and read only" },
  "rich-text": { label: "Rich text", description: "Edit formatted content" },
  source: { label: "Markdown", description: "Edit Markdown source" },
} as const;

export type MarkdownMode = keyof typeof MARKDOWN_MODES;
export const MARKDOWN_MODE_IDS: readonly MarkdownMode[] = ["preview", "rich-text", "source"];

export function isMarkdownMode(value: string): value is MarkdownMode {
  return value in MARKDOWN_MODES;
}

function isMarkdownInfo(item: ItemInfo | undefined): item is MarkdownInfo {
  return item?.type === "markdown";
}

interface MarkdownPaneContextValue {
  mode: MarkdownMode;
  setMode: (mode: MarkdownMode) => void;
}

interface LoadedMarkdownDocument {
  itemId: string;
  markdown: string;
}

const MarkdownPaneContext = React.createContext<MarkdownPaneContextValue | null>(null);

export function MarkdownPaneProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<MarkdownMode>("rich-text");
  const value = React.useMemo(() => ({ mode, setMode }), [mode]);
  return <MarkdownPaneContext.Provider value={value}>{children}</MarkdownPaneContext.Provider>;
}

export function useMarkdownPane(): MarkdownPaneContextValue {
  const context = React.useContext(MarkdownPaneContext);
  if (!context) throw new Error("useMarkdownPane must be used inside MarkdownPaneProvider.");
  return context;
}

const MARKDOWN_EXTENSIONS = [StarterKit, Markdown];
const MARKDOWN_PROSE_CLASS =
  "prose prose-sm prose-invert max-w-none break-words text-[0.9375rem] leading-[1.72] prose-p:leading-[1.72] prose-headings:font-heading prose-headings:tracking-tight prose-headings:mb-2 prose-headings:mt-6 prose-li:my-0.5 prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-background-secondary prose-pre:px-4 prose-pre:py-3 prose-code:font-mono prose-code:text-[0.875em] prose-a:text-link";

export function MarkdownPane({ itemId }: { itemId: string }) {
  const { mode, setMode } = useMarkdownPane();
  const { data: item, error } = useQuery(getItemQueryOptions(itemId));
  const queryClient = useQueryClient();
  const { data: sumiSettings } = useQuery(sumiSettingsQueryOptions);
  const port = useSystemStore(selectAiServerPort);
  const flushContent = useFlushMarkdownContent();
  const [document, setDocument] = React.useState<LoadedMarkdownDocument | null>(null);
  const loadedItemIdRef = React.useRef<string | null>(null);
  const startedEmptyRef = React.useRef(false);
  const autoTitleRequestedRef = React.useRef(false);

  const markdownItem = isMarkdownInfo(item) ? item : null;

  React.useEffect(() => {
    if (!markdownItem || loadedItemIdRef.current === markdownItem.id) return;
    loadedItemIdRef.current = markdownItem.id;
    startedEmptyRef.current = markdownItem.data.markdown.trim().length === 0;
    setDocument({ itemId: markdownItem.id, markdown: markdownItem.data.markdown });
  }, [markdownItem]);

  React.useEffect(
    () => () => {
      void markdownApi.flushContent(itemId).catch((flushError) => {
        console.error(`[markdown] Failed to flush item "${itemId}" during pane close.`, flushError);
      });
    },
    [itemId],
  );

  const saver = useAsyncDebouncer(
    async (nextMarkdown: string) => {
      await markdownApi.queueContent(itemId, nextMarkdown);
      const saved = await flushContent.mutateAsync({ id: itemId });
      const titleGeneration = sumiSettings?.titleGeneration;
      if (
        startedEmptyRef.current &&
        !autoTitleRequestedRef.current &&
        nextMarkdown.trim() &&
        saved.title === DEFAULT_MARKDOWN_TITLE &&
        titleGeneration?.enabled &&
        titleGeneration.autoGenerate &&
        titleGeneration.model &&
        port
      ) {
        autoTitleRequestedRef.current = true;
        void generateSumiItemTitle({
          apiUrl: `http://127.0.0.1:${port}/api/sumi`,
          itemId: saved.id,
        }).catch((titleError) => {
          toastManager.add({
            type: "error",
            title: "Title generation failed",
            description:
              titleError instanceof Error
                ? titleError.message
                : "Sumi could not generate a Markdown title.",
          });
        });
      }
      return saved;
    },
    {
      wait: 500,
      onError: (saveError) => {
        toastManager.add({
          type: "error",
          title: "Markdown save failed",
          description:
            saveError instanceof Error ? saveError.message : "The document could not be saved.",
        });
      },
      onUnmount: (debouncer) => {
        void debouncer.flush();
      },
    },
  );

  const previousModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (previousModeRef.current !== mode) {
      void saver.flush();
      previousModeRef.current = mode;
    }
  }, [mode, saver]);

  const updateMarkdown = React.useCallback(
    (nextMarkdown: string) => {
      setDocument({ itemId, markdown: nextMarkdown });
      queryClient.setQueryData<MarkdownInfo>(queryKeys.items.byId(itemId), (current) =>
        current ? { ...current, data: { ...current.data, markdown: nextMarkdown } } : current,
      );
      void markdownApi.queueContent(itemId, nextMarkdown).catch((queueError) => {
        console.error(`[markdown] Failed to queue content for item "${itemId}".`, queueError);
      });
      void saver.maybeExecute(nextMarkdown);
    },
    [itemId, queryClient, saver],
  );

  const markdown = document?.itemId === itemId ? document.markdown : null;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "The Markdown document could not be loaded."}
      </div>
    );
  }
  if (!markdownItem || markdown === null) return <div className="flex-1" />;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-surface">
      {mode === "source" ? (
        <textarea
          autoFocus
          aria-label="Markdown source"
          spellCheck
          value={markdown}
          placeholder="Write Markdown…"
          onChange={(event) => updateMarkdown(event.target.value)}
          onBlur={() => void saver.flush()}
          className="h-full min-h-full w-full resize-none bg-transparent px-6 py-5 font-mono text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      ) : markdown.trim() || mode === "rich-text" ? (
        <MarkdownEditor
          markdown={markdown}
          editable={mode === "rich-text"}
          onChange={updateMarkdown}
          onBlur={() => void saver.flush()}
        />
      ) : (
        <Empty className="h-full rounded-none border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FileScriptIcon} />
            </EmptyMedia>
            <EmptyTitle>Start this document</EmptyTitle>
            <EmptyDescription>
              Write formatted text or switch to Markdown source when you need exact syntax.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setMode("rich-text")}>
            Edit document
          </Button>
        </Empty>
      )}
    </div>
  );
}

export function MarkdownEditor({
  markdown,
  editable,
  onChange,
  onBlur,
}: {
  markdown: string;
  editable: boolean;
  onChange: (markdown: string) => void;
  onBlur: () => void;
}) {
  const editor = useEditor({
    extensions: MARKDOWN_EXTENSIONS,
    content: markdown,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": editable ? "Markdown rich text editor" : "Markdown preview",
        class: `${MARKDOWN_PROSE_CLASS} min-h-full outline-none`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (currentEditor.isEditable) onChange(currentEditor.getMarkdown());
    },
    onBlur,
  });

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable, false);
    if (editable) editor.commands.focus("end");
  }, [editable, editor]);

  React.useEffect(() => {
    if (!editor || editable) return;
    editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
  }, [editable, editor, markdown]);

  return (
    <EditorContent
      editor={editor}
      className="mx-auto min-h-full w-full max-w-3xl px-7 py-7 [&_.tiptap]:min-h-[calc(100vh-8rem)]"
    />
  );
}
