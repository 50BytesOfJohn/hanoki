import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAsyncDebouncer } from "@tanstack/react-pacer";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { Marked, marked } from "marked";
import { FileScriptIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ItemInfo, MarkdownInfo } from "@shared/ipc";
import { joinFrontmatter, splitFrontmatter } from "@shared/markdown/frontmatter";
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
import { FrontmatterBlock } from "./markdown-preview";
import { registerMarkdownEditor, registerMarkdownSaver } from "./markdown-session";
import { RichTextReadonlyBanner } from "./rich-text-readonly-banner";
import { RICH_TEXT_SCHEMA_EXTENSIONS } from "./rich-text-schema";
import { inspectRichText, type RichTextInspection } from "./rich-text-safety";
import { BacklinksFooter, setWikilinkEditorContext, WikilinkEditor } from "./wikilink-ui";
import { getItemQueryOptions } from "@/queries/items";
import { queryKeys } from "@/queries/keys";
import { sumiSettingsQueryOptions } from "@/queries/settings";
import { openExternalFromMouseEvent } from "@/lib/open-external-link";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";

export const NOTE_LINK_OPTIONS = {
  openOnClick: false,
  HTMLAttributes: {
    rel: "noopener noreferrer nofollow",
    target: null,
  },
};

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

function freshMarked(): typeof marked {
  const instance = new Marked();
  // SAFETY: MarkdownManager only calls lexer, parser, use, and setOptions, which Marked implements.
  return instance as unknown as typeof marked;
}

function createMarkdownExtensions() {
  return [
    ...RICH_TEXT_SCHEMA_EXTENSIONS,
    WikilinkEditor,
    Markdown.configure({ marked: freshMarked() }),
  ];
}
const MARKDOWN_PROSE_CLASS =
  "prose prose-sm prose-invert max-w-none break-words text-[0.9375rem] leading-[1.72] prose-p:leading-[1.72] prose-headings:font-heading prose-headings:tracking-tight prose-headings:mb-2 prose-headings:mt-6 prose-li:my-0.5 prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-background-secondary prose-pre:px-4 prose-pre:py-3 prose-code:font-mono prose-code:text-[0.875em] prose-a:text-link [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1 [&_img]:max-w-full";

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
          mode: "auto",
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
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const restoreScrollRef = React.useRef<number | null>(null);

  function editInMarkdown() {
    restoreScrollRef.current = scrollerRef.current?.scrollTop ?? 0;
    setMode("source");
  }

  React.useLayoutEffect(() => {
    const top = restoreScrollRef.current;
    if (top === null) return;
    restoreScrollRef.current = null;
    if (scrollerRef.current) scrollerRef.current.scrollTop = top;
  }, [mode]);

  React.useEffect(() => {
    return registerMarkdownSaver(itemId, {
      flush: () => saver.flush(),
      cancel: () => {
        saver.cancel();
      },
      adopt: (nextMarkdown) => {
        setDocument({ itemId, markdown: nextMarkdown });
      },
    });
  }, [itemId, saver]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "The Markdown document could not be loaded."}
      </div>
    );
  }
  if (!markdownItem || markdown === null) return <div className="flex-1" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div ref={scrollerRef} data-markdown-scroller className="min-h-0 flex-1 overflow-auto">
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
            itemId={itemId}
            workspaceId={markdownItem.workspaceId}
            folderId={markdownItem.folderId}
            markdown={markdown}
            editable={mode === "rich-text"}
            onEditInMarkdown={editInMarkdown}
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
      <BacklinksFooter itemId={itemId} />
    </div>
  );
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <MarkdownViewBoundary resetKey={props.itemId}>
      <MarkdownEditorView {...props} />
    </MarkdownViewBoundary>
  );
}

function MarkdownEditorView({
  itemId,
  workspaceId,
  folderId,
  markdown,
  editable,
  onEditInMarkdown,
  onChange,
  onBlur,
  inspect = inspectRichText,
}: MarkdownEditorProps) {
  const parts = splitFrontmatter(markdown);
  const body = parts.body;
  const frontmatterRef = React.useRef(parts.frontmatter);
  frontmatterRef.current = parts.frontmatter;
  const emittedRef = React.useRef<string | null>(null);
  const originalRef = React.useRef(markdown);
  const [safety, setSafety] = React.useState<CheckedMarkdown | null>(null);
  const [extensions] = React.useState(createMarkdownExtensions);
  const fromEditor = markdown === emittedRef.current;
  const ready = safety !== null && safety.markdown === markdown ? safety : null;
  const pending = editable && !fromEditor && ready === null;
  const losesContent = !fromEditor && ready !== null && ready.result.losesContent;
  const canEdit = editable && !pending && !losesContent;
  const locked = editable && losesContent;
  const onChangeRef = React.useRef(onChange);
  const baselineRef = React.useRef<string | null>(null);
  const emittedSinceBaselineRef = React.useRef(false);
  const hydratedBodyRef = React.useRef(body);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions,
    content: body,
    contentType: "markdown",
    editable: false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: `${MARKDOWN_PROSE_CLASS} min-h-full outline-none`,
      },
      handleDOMEvents: {
        click: (_view, event) => openExternalFromMouseEvent(event),
      },
    },
    onUpdate: ({ editor: currentEditor, transaction }) => {
      if (!transaction.docChanged || baselineRef.current === null || !currentEditor.isEditable) {
        return;
      }
      const serialized = currentEditor.getMarkdown();
      const nextBody = preserveSourceBytes(splitFrontmatter(originalRef.current).body, serialized);
      if (serialized === baselineRef.current) {
        if (!emittedSinceBaselineRef.current) return;
        emittedSinceBaselineRef.current = false;
        emittedRef.current = originalRef.current;
        onChangeRef.current(originalRef.current);
        return;
      }
      const next = joinFrontmatter(frontmatterRef.current, nextBody);
      emittedSinceBaselineRef.current = true;
      emittedRef.current = next;
      onChangeRef.current(next);
    },
    onBlur,
  });

  const captureBaseline = React.useCallback(() => {
    if (!editor) return;
    baselineRef.current = editor.getMarkdown();
    emittedSinceBaselineRef.current = false;
  }, [editor]);

  React.useLayoutEffect(() => {
    if (!editor) return;
    baselineRef.current = null;
    editor.setEditable(canEdit, false);
    editor.view.dom.setAttribute(
      "aria-label",
      canEdit
        ? "Markdown rich text editor"
        : editable
          ? "Markdown rich text, read only"
          : "Markdown preview",
    );
    if (canEdit) editor.commands.focus("end");
    captureBaseline();
  }, [canEdit, captureBaseline, editable, editor]);

  React.useEffect(() => {
    if (!editor) return;
    setWikilinkEditorContext(editor, workspaceId, folderId);
    return registerMarkdownEditor(itemId, editor, captureBaseline);
  }, [captureBaseline, editor, folderId, itemId, workspaceId]);

  React.useEffect(() => {
    if (!editor || markdown === emittedRef.current) return;
    originalRef.current = markdown;
    if (hydratedBodyRef.current !== body) {
      editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
      hydratedBodyRef.current = body;
    }
    setSafety({ markdown, result: inspect(markdown, editor.getMarkdown()) });
  }, [body, editor, inspect, markdown]);

  return (
    <>
      {locked ? (
        <RichTextReadonlyBanner
          summary={ready === null ? null : ready.result.summary}
          onEditInMarkdown={onEditInMarkdown ?? (() => {})}
        />
      ) : null}
      {parts.frontmatter ? <FrontmatterBlock source={parts.frontmatter} /> : null}
      <EditorContent
        editor={editor}
        className="mx-auto min-h-full w-full max-w-3xl px-7 py-7 [&_.tiptap]:min-h-[calc(100vh-8rem)]"
      />
    </>
  );
}

interface MarkdownEditorProps {
  itemId: string;
  workspaceId: string;
  folderId: string | null;
  markdown: string;
  editable: boolean;
  onEditInMarkdown?: () => void;
  onChange: (markdown: string) => void;
  onBlur: () => void;
  inspect?: (markdown: string, serialized?: string) => RichTextInspection;
}

export class MarkdownViewBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="px-7 py-7 text-sm text-muted-foreground">This note could not be displayed.</p>
      );
    }
    return this.props.children;
  }
}

function preserveSourceBytes(source: string, serialized: string): string {
  if (source.includes("\r\n") && !serialized.includes("\r\n")) {
    return serialized.replaceAll("\n", "\r\n");
  }
  return serialized;
}

interface CheckedMarkdown {
  markdown: string;
  result: RichTextInspection;
}
