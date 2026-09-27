import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  AiWebBrowsingIcon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  Database02Icon,
  FileScriptIcon,
  LinkSquare02Icon,
  MessagesSquare,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { chatTreeApi } from "@/api/chat-tree";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/query-client";
import { useUpdateChatSettings } from "@/mutations/chats";
import { getChatQueryOptions } from "@/queries/chats";
import { queryKeys } from "@/queries/keys";
import { useWorkspaceStore } from "@/features/workspace/store";
import { MAX_ATTACHED_ITEMS, type AttachedItemRef } from "@shared/chat/attached-items";
import type { ChatInfo, ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo } from "@shared/ipc";
import {
  CHAT_TOOL_LABELS,
  HANOKI_TOOL_ID,
  TERMINAL_TOOL_ID,
  WEB_TOOL_ID,
  type ChatToolId,
} from "@shared/tiptap/document";
import { useChatId } from "./chat-context";

export interface MentionCatalogItem {
  kind: AttachedItemRef["kind"];
  itemId: string;
  title: string;
}

export interface MentionCatalog {
  notes: MentionCatalogItem[];
  chats: MentionCatalogItem[];
}

interface ToolPickerItem {
  id: ChatToolId;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}

const TOOL_PICKER_ITEMS: ToolPickerItem[] = [
  {
    id: WEB_TOOL_ID,
    label: CHAT_TOOL_LABELS[WEB_TOOL_ID],
    description: "Web search",
    icon: AiWebBrowsingIcon,
  },
  {
    id: HANOKI_TOOL_ID,
    label: CHAT_TOOL_LABELS[HANOKI_TOOL_ID],
    description: "Workspace data",
    icon: Database02Icon,
  },
  {
    id: TERMINAL_TOOL_ID,
    label: CHAT_TOOL_LABELS[TERMINAL_TOOL_ID],
    description: "Commands & files",
    icon: ComputerTerminal01Icon,
  },
];

type PickerRow =
  | {
      key: string;
      type: "item";
      kind: AttachedItemRef["kind"];
      itemId: string;
      title: string;
      icon: ToolPickerItem["icon"];
      kindLabel: string;
    }
  | {
      key: string;
      type: "tool";
      id: ChatToolId;
      label: string;
      description: string;
      icon: ToolPickerItem["icon"];
    };

export const mentionBridge = {
  workspaceId: null as string | null,
  attachItem: (_item: AttachedItemRef) => {},
  insertToolMention: (_tool: { id: ChatToolId; label: string }) => {},
};

export function flattenMentionCatalog(snapshot: ChatTreeSnapshot): MentionCatalog {
  const notes: MentionCatalogItem[] = [];
  const chats: MentionCatalogItem[] = [];

  const walk = (folders: ChatTreeFolderNode[], items: ItemInfo[]) => {
    for (const item of items) {
      if (item.type === "markdown") {
        notes.push({ kind: "note", itemId: item.id, title: item.title });
      } else if (item.type === "chat") {
        chats.push({ kind: "chat", itemId: item.id, title: item.title });
      }
    }
    for (const folder of folders) walk(folder.folders, folder.items);
  };

  walk(snapshot.rootFolders, snapshot.rootItems);
  const byTitle = (a: MentionCatalogItem, b: MentionCatalogItem) =>
    a.title.localeCompare(b.title) || a.itemId.localeCompare(b.itemId);
  notes.sort(byTitle);
  chats.sort(byTitle);
  return { notes, chats };
}

function matchesQuery(value: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length === 0 || value.toLowerCase().includes(needle);
}

export interface MentionPickerHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface MentionPickerProps {
  query: string;
  notes: MentionCatalogItem[];
  chats: MentionCatalogItem[];
  catalogReady: boolean;
  includeTools?: boolean;
  showSearch?: boolean;
  onQueryChange?: (query: string) => void;
  onPickItem: (item: AttachedItemRef) => void;
  onPickTool: (tool: { id: ChatToolId; label: string }) => void;
}

export const MentionPicker = React.forwardRef<MentionPickerHandle, MentionPickerProps>(
  function MentionPicker(
    {
      query,
      notes,
      chats,
      catalogReady,
      includeTools = true,
      showSearch = false,
      onQueryChange,
      onPickItem,
      onPickTool,
    },
    ref,
  ) {
    const rows = React.useMemo(() => {
      const next: PickerRow[] = [];
      for (const note of notes) {
        if (!matchesQuery(note.title, query)) continue;
        next.push({
          key: `note:${note.itemId}`,
          type: "item",
          kind: "note",
          itemId: note.itemId,
          title: note.title,
          icon: FileScriptIcon,
          kindLabel: "Note",
        });
      }
      for (const chat of chats) {
        if (!matchesQuery(chat.title, query)) continue;
        next.push({
          key: `chat:${chat.itemId}`,
          type: "item",
          kind: "chat",
          itemId: chat.itemId,
          title: chat.title,
          icon: MessagesSquare,
          kindLabel: "Chat",
        });
      }
      if (includeTools) {
        for (const tool of TOOL_PICKER_ITEMS) {
          if (!matchesQuery(tool.label, query)) continue;
          next.push({ key: `tool:${tool.id}`, type: "tool", ...tool });
        }
      }
      return next;
    }, [chats, includeTools, notes, query]);

    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const rowKey = rows.map((row) => row.key).join("\n");

    React.useEffect(() => {
      setSelectedIndex(0);
    }, [rowKey]);

    const selectRow = React.useCallback(
      (index: number) => {
        const row = rows[index];
        if (!row) return;
        if (row.type === "item") {
          onPickItem({ kind: row.kind, itemId: row.itemId });
          return;
        }
        onPickTool({ id: row.id, label: row.label });
      },
      [onPickItem, onPickTool, rows],
    );

    const onKeyDown = React.useCallback(
      (event: KeyboardEvent) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
        }
        if (rows.length === 0)
          return event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter";
        if (event.key === "ArrowUp") {
          setSelectedIndex((current) => (current + rows.length - 1) % rows.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((current) => (current + 1) % rows.length);
          return true;
        }
        if (event.key === "Enter") {
          selectRow(selectedIndex);
          return true;
        }
        return false;
      },
      [rows.length, selectRow, selectedIndex],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => onKeyDown(event),
      }),
      [onKeyDown],
    );

    const noteRows = rows.filter((row) => row.type === "item" && row.kind === "note");
    const chatRows = rows.filter((row) => row.type === "item" && row.kind === "chat");
    const toolRows = rows.filter((row) => row.type === "tool");

    return (
      <div
        className="w-72 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl"
        role="listbox"
        aria-label="Mention"
      >
        {showSearch ? (
          <div className="p-1">
            <div className="flex h-8 items-center gap-2 rounded-lg bg-input/30 px-2">
              <HugeiconsIcon
                icon={Search01Icon}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => onQueryChange?.(event.target.value)}
                onKeyDown={(event) => {
                  onKeyDown(event.nativeEvent);
                }}
                placeholder="Mention an item…"
                aria-label="Mention an item"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
        ) : null}
        <div className="max-h-72 overflow-y-auto p-1">
          <PickerSection
            heading="Notes"
            emptyLabel="No notes match"
            rows={noteRows}
            showEmpty={catalogReady}
            selectedKey={rows[selectedIndex]?.key}
            onSelect={selectRow}
            onHover={setSelectedIndex}
            rowIndex={(row) => rows.findIndex((candidate) => candidate.key === row.key)}
          />
          <PickerSection
            heading="Chats"
            emptyLabel="No chats match"
            rows={chatRows}
            showEmpty={catalogReady}
            selectedKey={rows[selectedIndex]?.key}
            onSelect={selectRow}
            onHover={setSelectedIndex}
            rowIndex={(row) => rows.findIndex((candidate) => candidate.key === row.key)}
          />
          {includeTools ? (
            <PickerSection
              heading="Tools"
              emptyLabel="No tools match"
              rows={toolRows}
              showEmpty
              selectedKey={rows[selectedIndex]?.key}
              onSelect={selectRow}
              onHover={setSelectedIndex}
              rowIndex={(row) => rows.findIndex((candidate) => candidate.key === row.key)}
            />
          ) : null}
        </div>
      </div>
    );
  },
);

function PickerSection({
  heading,
  emptyLabel,
  rows,
  showEmpty,
  selectedKey,
  onSelect,
  onHover,
  rowIndex,
}: {
  heading: string;
  emptyLabel: string;
  rows: PickerRow[];
  showEmpty: boolean;
  selectedKey: string | undefined;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
  rowIndex: (row: PickerRow) => number;
}) {
  return (
    <div role="group" aria-label={heading}>
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{heading}</div>
      {rows.length === 0 ? (
        showEmpty ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyLabel}</div>
        ) : null
      ) : (
        rows.map((row) => {
          const index = rowIndex(row);
          const selected = row.key === selectedKey;
          const label = row.type === "item" ? row.title : row.label;
          const detail = row.type === "item" ? row.kindLabel : row.description;
          return (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={selected}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none",
                selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
              onMouseMove={() => onHover(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(index);
              }}
            >
              <HugeiconsIcon icon={row.icon} className="size-4 text-muted-foreground" />
              <span className="min-w-0 truncate font-medium">{label}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{detail}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function useMentionCatalog() {
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  return useQuery({
    queryKey: queryKeys.chatTree.snapshot(workspaceId ?? ""),
    queryFn: () => {
      if (!workspaceId) throw new Error("Workspace ID is required.");
      return chatTreeApi.getTree(workspaceId);
    },
    select: flattenMentionCatalog,
    enabled: Boolean(workspaceId),
  });
}

export function ContextChips() {
  const chatId = useChatId();
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const catalog = useMentionCatalog();
  const updateChatSettings = useUpdateChatSettings();
  const items = chat?.data.settings.attachedItemIds ?? [];
  if (items.length === 0) return null;

  function removeItem(item: AttachedItemRef) {
    const current = queryClient.getQueryData<ChatInfo>(queryKeys.chats.byId(chatId));
    const existing = current?.data.settings.attachedItemIds ?? items;
    updateChatSettings.mutate({
      id: chatId,
      input: {
        attachedItemIds: existing.filter(
          (entry) => entry.kind !== item.kind || entry.itemId !== item.itemId,
        ),
      },
    });
  }

  return (
    <div className="flex flex-wrap gap-1 px-2 pt-0.5">
      {items.map((item) => {
        const list = item.kind === "note" ? catalog.data?.notes : catalog.data?.chats;
        const match = list?.find((entry) => entry.itemId === item.itemId) ?? null;
        const broken = catalog.isFetched && !match;
        const title = match?.title ?? (broken ? "Missing" : "…");
        const kindLabel = item.kind === "note" ? "Note" : "Chat";
        return (
          <span
            key={`${item.kind}:${item.itemId}`}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs",
              broken ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={item.kind === "note" ? FileScriptIcon : MessagesSquare}
              className="size-3 shrink-0 text-muted-foreground"
            />
            <span className="max-w-40 truncate">{title}</span>
            <span className="text-muted-foreground">{kindLabel}</span>
            {match ? (
              <button
                type="button"
                aria-label={`Open ${title}`}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => openAttachedItem(item)}
              >
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={`Remove ${title}`}
              className="rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => removeItem(item)}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

function openAttachedItem(item: AttachedItemRef) {
  const itemType = item.kind === "note" ? "markdown" : "chat";
  const { tabs, activeTabId, openTab, splitPane } = useWorkspaceStore.getState();
  const tab = tabs.find((candidate) => candidate.id === activeTabId);
  if (!tab) {
    openTab({ type: itemType, itemId: item.itemId });
    return;
  }
  splitPane(tab.id, tab.focusedPaneId, item.itemId, itemType, "right");
}

export function MentionItemsMenu({
  anchorRef,
  open,
  onOpenChange,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = React.useState("");
  const catalog = useMentionCatalog();

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchorRef}
          side="top"
          align="start"
          sideOffset={8}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup className="z-50 border-0 bg-transparent p-0 shadow-none ring-0 outline-hidden">
            {open ? (
              <MentionPicker
                query={query}
                onQueryChange={setQuery}
                notes={catalog.data?.notes ?? []}
                chats={catalog.data?.chats ?? []}
                catalogReady={catalog.isSuccess}
                showSearch
                onPickItem={(item) => {
                  mentionBridge.attachItem(item);
                  onOpenChange(false);
                }}
                onPickTool={(tool) => {
                  mentionBridge.insertToolMention(tool);
                  onOpenChange(false);
                }}
              />
            ) : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function useAttachContextItem() {
  const chatId = useChatId();
  const updateChatSettings = useUpdateChatSettings();
  const client = useQueryClient();

  return React.useCallback(
    (item: AttachedItemRef) => {
      const current = client.getQueryData<ChatInfo>(queryKeys.chats.byId(chatId));
      const existing = current?.data.settings.attachedItemIds ?? [];
      if (existing.some((entry) => entry.kind === item.kind && entry.itemId === item.itemId)) {
        return;
      }
      if (existing.length >= MAX_ATTACHED_ITEMS) return;
      updateChatSettings.mutate({
        id: chatId,
        input: { attachedItemIds: [...existing, item] },
      });
    },
    [chatId, client, updateChatSettings],
  );
}

export const AtMentionList = React.forwardRef<
  MentionPickerHandle,
  SuggestionProps<{ id: string }, MentionNodeAttrs>
>(function AtMentionList({ query, editor, range, command }, ref) {
  const [catalog, setCatalog] = React.useState<MentionCatalog | null>(null);

  React.useEffect(() => {
    const workspaceId = mentionBridge.workspaceId;
    if (!workspaceId) {
      setCatalog({ notes: [], chats: [] });
      return;
    }
    let cancelled = false;
    void chatTreeApi
      .getTree(workspaceId)
      .then((snapshot) => {
        if (!cancelled) setCatalog(flattenMentionCatalog(snapshot));
      })
      .catch(() => {
        if (!cancelled) setCatalog({ notes: [], chats: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MentionPicker
      ref={ref}
      query={query}
      notes={catalog?.notes ?? []}
      chats={catalog?.chats ?? []}
      catalogReady={catalog !== null}
      onPickItem={(item) => {
        editor.chain().focus().deleteRange(range).run();
        mentionBridge.attachItem(item);
      }}
      onPickTool={(tool) => command({ id: tool.id, label: tool.label })}
    />
  );
});
