import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, ReactRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { parseChatTitle } from "@shared/chat/chat-title";
import type { MarkdownTitleOption, NoteBacklink } from "@shared/ipc";
import { normalizeWikilinkTitle, oldestByItemId } from "@shared/markdown/wikilink";

import { markdownApi } from "@/api/markdown";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toastManager } from "@/components/ui/toast";
import { subscribeToItemTitleUpdates } from "@/features/items/item-title-events";
import { useWorkspaceStore } from "@/features/workspace/store";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/queries/keys";

import { Wikilink } from "./wikilink-extension";

const wikilinkSuggestionKey = new PluginKey("hanoki-wikilink");
const CREATE_VALUE = "__create";

interface EditorNoteContext {
  workspaceId: string;
  folderId: string | null;
}

const editorNoteContext = new WeakMap<Editor, EditorNoteContext>();

export function setWikilinkEditorContext(
  editor: Editor,
  workspaceId: string,
  folderId: string | null,
): void {
  editorNoteContext.set(editor, { workspaceId, folderId });
}

interface WikilinkCommand {
  id: string;
  title: string;
}

export const WikilinkEditor = Wikilink.extend({
  addNodeView() {
    return ReactNodeViewRenderer(WikilinkNodeView, {
      as: "span",
      className: "tiptap-wikilink",
      stopEvent: ({ event }) =>
        event.target instanceof HTMLElement && Boolean(event.target.closest("button")),
    });
  },

  addProseMirrorPlugins() {
    const parent = this.parent?.() ?? [];
    return [
      ...parent,
      Suggestion<WikilinkCommand, WikilinkCommand>({
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        pluginKey: wikilinkSuggestionKey,
        items: ({ query }) => [{ id: "wikilink", title: query }],
        command: ({ editor, range, props }) => {
          insertWikilink(editor, range, props.title);
        },
        allow: ({ editor }) => editor.isEditable,
        render: () => {
          let component: ReactRenderer<
            WikilinkPickerHandle,
            SuggestionProps<WikilinkCommand>
          > | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart(props) {
              component = new ReactRenderer(WikilinkSuggestionList, {
                editor: props.editor,
                props,
              });
              unmount = props.mount(component.element);
            },
            onUpdate(props) {
              component?.updateProps(props);
            },
            onKeyDown(props) {
              if (props.event.key === "Escape") return false;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              unmount?.();
              component?.destroy();
              unmount = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});

function WikilinkNodeView({ node }: ReactNodeViewProps) {
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const { data: titles } = useQuery({
    queryKey: queryKeys.notes.titles(workspaceId ?? ""),
    queryFn: () => markdownApi.listTitles(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
  const targetText = typeof node.attrs.targetText === "string" ? node.attrs.targetText : "";
  const alias =
    typeof node.attrs.alias === "string" && node.attrs.alias.length > 0 ? node.attrs.alias : null;
  const [renamedTitle, setRenamedTitle] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRenamedTitle(null);
  }, [targetText]);

  const resolved = resolveTitle(titles, targetText);
  React.useEffect(() => {
    return subscribeToItemTitleUpdates((event) => {
      if (event.itemType !== "markdown" || event.itemId !== resolved?.id) return;
      setRenamedTitle(event.title);
    });
  }, [resolved?.id]);

  const broken = Boolean(titles) && !resolved && renamedTitle === null;
  const label = alias ?? renamedTitle ?? resolved?.title ?? targetText;

  return (
    <NodeViewWrapper as="span">
      <button
        type="button"
        className={cn(broken && "wikilink-broken")}
        disabled={broken || !resolved}
        aria-label={broken ? `Unresolved link ${label}` : `Open ${label}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => {
          if (resolved) openNoteBeside(resolved.id);
        }}
      >
        {label}
      </button>
    </NodeViewWrapper>
  );
}

export interface WikilinkPickerHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const WikilinkSuggestionList = React.forwardRef<
  WikilinkPickerHandle,
  SuggestionProps<WikilinkCommand>
>(function WikilinkSuggestionList({ query, editor, range }, ref) {
  const [notes, setNotes] = React.useState<MarkdownTitleOption[] | null>(null);

  React.useEffect(() => {
    const workspaceId = editorNoteContext.get(editor)?.workspaceId ?? null;
    if (!workspaceId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    void markdownApi
      .listTitles(workspaceId)
      .then((rows) => {
        if (!cancelled) setNotes(rows);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editor]);

  const createTitle = query.trim();
  const canCreate = parseChatTitle(createTitle).ok;

  return (
    <WikilinkPicker
      ref={ref}
      query={query}
      notes={notes ?? []}
      ready={notes !== null}
      canCreate={canCreate}
      onPick={(note) => {
        insertWikilink(editor, range, note.title);
      }}
      onCreate={() => {
        void createLinkedNote(editor, range, createTitle);
      }}
    />
  );
});

const WikilinkPicker = React.forwardRef<
  WikilinkPickerHandle,
  {
    query: string;
    notes: MarkdownTitleOption[];
    ready: boolean;
    canCreate: boolean;
    onPick: (note: MarkdownTitleOption) => void;
    onCreate: () => void;
  }
>(function WikilinkPicker({ query, notes, ready, canCreate, onPick, onCreate }, ref) {
  const matches = React.useMemo(() => filterNotes(notes, query), [notes, query]);
  const showCreate = query.trim().length > 0 && canCreate;
  const values = React.useMemo(
    () => [...matches.map((note) => note.id), ...(showCreate ? [CREATE_VALUE] : [])],
    [matches, showCreate],
  );
  const [selected, setSelected] = React.useState(values[0] ?? "");
  const valueKey = values.join("\n");

  React.useEffect(() => {
    setSelected(values[0] ?? "");
  }, [valueKey, values]);

  const choose = React.useCallback(
    (value: string) => {
      if (value === CREATE_VALUE) {
        onCreate();
        return;
      }
      const note = matches.find((candidate) => candidate.id === value);
      if (note) onPick(note);
    },
    [matches, onCreate, onPick],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
        if (values.length === 0) return true;
        const index = Math.max(0, values.indexOf(selected));
        if (event.key === "ArrowDown") {
          setSelected(values[(index + 1) % values.length] ?? values[0] ?? "");
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected(values[(index + values.length - 1) % values.length] ?? values[0] ?? "");
          return true;
        }
        choose(selected || values[0] || "");
        return true;
      },
    }),
    [choose, selected, values],
  );

  return (
    <Command
      className="wikilink-picker w-72 shadow-xl"
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
    >
      <CommandList>
        {ready && matches.length === 0 ? (
          <div className="px-2 py-2 text-center text-[13px] text-muted-foreground">
            No matching notes
          </div>
        ) : null}
        <CommandGroup>
          {matches.map((note) => (
            <CommandItem
              key={note.id}
              value={note.id}
              className="h-7 py-0 text-[13px] [&_svg:last-child]:hidden"
              onSelect={() => onPick(note)}
            >
              <span className="min-w-0 flex-1 truncate">{note.title}</span>
              {note.folderPath ? (
                <span className="max-w-28 shrink-0 truncate text-[12px] text-muted-foreground">
                  {note.folderPath}
                </span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
        {showCreate ? (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value={CREATE_VALUE}
                className="h-7 py-0 text-[13px] text-muted-foreground [&_svg:last-child]:hidden"
                onSelect={() => onCreate()}
              >
                <span className="truncate">Create “{query.trim()}”</span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
});

export function BacklinksFooter({ itemId }: { itemId: string }) {
  const [open, setOpen] = React.useState(true);
  const query = useQuery({
    queryKey: queryKeys.notes.backlinks(itemId),
    queryFn: () => markdownApi.listBacklinks(itemId),
  });
  const links = query.data ?? [];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-separator">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-6 py-1.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          className="size-3 shrink-0"
        />
        Backlinks
      </CollapsibleTrigger>
      <CollapsibleContent>
        {query.isPending ? null : query.isError ? (
          <p className="px-6 py-2 text-[12px] text-muted-foreground">
            Backlinks could not be loaded.
          </p>
        ) : links.length === 0 ? (
          <p className="px-6 py-2 text-[12px] text-muted-foreground">Nothing links here yet</p>
        ) : (
          <div className="px-4 pb-2">
            {links.map((link) => (
              <BacklinkRow key={link.itemId} link={link} />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function BacklinkRow({ link }: { link: NoteBacklink }) {
  return (
    <button
      type="button"
      className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-hover"
      onClick={() => openNoteBeside(link.itemId)}
    >
      <span className="text-[13px] text-foreground">{link.title}</span>
      {link.snippet ? (
        <span className="line-clamp-1 text-[12px] text-muted-foreground">{link.snippet}</span>
      ) : null}
    </button>
  );
}

function filterNotes(notes: readonly MarkdownTitleOption[], query: string): MarkdownTitleOption[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...notes];
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(needle) || note.folderPath.toLowerCase().includes(needle),
  );
}

function resolveTitle(
  titles: readonly MarkdownTitleOption[] | undefined,
  target: string,
): MarkdownTitleOption | null {
  if (!titles) return null;
  const key = normalizeWikilinkTitle(target);
  return oldestByItemId(titles.filter((title) => normalizeWikilinkTitle(title.title) === key));
}

function insertWikilink(editor: Editor, range: { from: number; to: number }, title: string): void {
  const target = title.trim();
  if (target.length === 0) return;
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: "wikilink", attrs: { targetText: target, alias: null } },
      { type: "text", text: " " },
    ])
    .run();
}

async function createLinkedNote(
  editor: Editor,
  range: { from: number; to: number },
  title: string,
): Promise<void> {
  const context = editorNoteContext.get(editor);
  const parsed = parseChatTitle(title);
  if (!context?.workspaceId || !parsed.ok) return;
  try {
    const created = await markdownApi.create(context.workspaceId, parsed.value, context.folderId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
    insertWikilink(editor, range, created.title);
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Note could not be created",
      description: error instanceof Error ? error.message : "The note could not be created.",
    });
  }
}

function openNoteBeside(itemId: string): void {
  const { tabs, activeTabId, openTab, splitPane } = useWorkspaceStore.getState();
  const tab = tabs.find((candidate) => candidate.id === activeTabId);
  if (!tab) {
    openTab({ type: "markdown", itemId });
    return;
  }
  splitPane(tab.id, tab.focusedPaneId, itemId, "markdown", "right");
}
