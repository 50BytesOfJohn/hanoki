import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight02Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ChatTreeFolderNode, ChatTreeSnapshot, ItemInfo } from "@shared/ipc";

import { chatTreeApi } from "@/api/chat-tree";
import { foldersApi } from "@/api/folders";
import { itemsApi } from "@/api/items";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { toastManager } from "@/components/ui/toast";
import { requestSidebarFolderReveal } from "@/features/chat/sidebar-reveal";
import { notifyChatTreeChanged } from "@/features/items/item-title-events";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useRenameChatTreeItem } from "@/mutations/chat-tree";
import { queryKeys } from "@/queries/keys";

type ItemKind = "chat" | "markdown" | "terminal" | "folder";

export type OpenableItemType = Exclude<ItemKind, "folder">;

const KIND_NOUN: Record<ItemKind, string> = {
  chat: "chat",
  markdown: "note",
  terminal: "terminal",
  folder: "folder",
};

export interface ToolResultCardProps {
  input: unknown;
  output: unknown;
  /** The row's plain-language label, for results too old or odd to read. */
  label: string;
  /** The technical details button, revealed when the line is hovered. */
  details: React.ReactNode;
}

interface ItemSummary {
  kind: ItemKind;
  id: string;
  name: string;
  path: string | null;
}

function readString(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = (value as Record<string, unknown>)[field];
  return typeof entry === "string" && entry.length > 0 ? entry : null;
}

function readItemSummary(value: unknown): ItemSummary | null {
  const kind = readString(value, "kind");
  const id = readString(value, "id");
  const name = readString(value, "name") ?? readString(value, "title");
  if (!id || !name) return null;
  if (kind !== "chat" && kind !== "markdown" && kind !== "terminal" && kind !== "folder") {
    return null;
  }
  return { kind, id, name, path: readString(value, "path") };
}

function readItemList(value: unknown, field: string): unknown[] {
  if (typeof value !== "object" || value === null) return [];
  const entries = (value as Record<string, unknown>)[field];
  return Array.isArray(entries) ? entries : [];
}

function listNames(names: string[]): string {
  const [first, second] = names;
  if (names.length <= 1) return first ?? "";
  if (names.length === 2) return `${first} and ${second}`;
  return `${first}, ${second} and ${names.length - 2} more`;
}

// --- Workspace lookups ---

export function indexChatTree(snapshot: ChatTreeSnapshot | undefined) {
  const folders = new Map<string, string>();
  const items = new Map<string, string>();
  const parents = new Map<string, string | null>();
  const visit = (
    parentId: string | null,
    folderNodes: ChatTreeFolderNode[],
    nodeItems: ItemInfo[],
  ) => {
    for (const item of nodeItems) {
      items.set(item.id, item.title);
      parents.set(item.id, parentId);
    }
    for (const folder of folderNodes) {
      folders.set(folder.id, folder.name);
      parents.set(folder.id, parentId);
      visit(folder.id, folder.folders, folder.items);
    }
  };
  if (snapshot) visit(null, snapshot.rootFolders, snapshot.rootItems);
  return { folders, items, parents };
}

/** Current workspace state, so a card can tell what has changed since the tool ran. */
function useChatTreeIndex() {
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.chatTree.snapshot(workspaceId ?? ""),
    queryFn: () => chatTreeApi.getTree(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
  const index = React.useMemo(() => indexChatTree(data), [data]);
  const isSettled = Boolean(data) && !isFetching;

  return {
    ...index,
    workspaceId,
    /** False while unknown: cards then keep their actions rather than hide them. */
    isSettled,
    currentName: (id: string) => index.items.get(id) ?? index.folders.get(id),
  };
}

// --- Actions ---

export function openHanokiItem(
  itemId: string,
  itemType: OpenableItemType,
  mode: "focus" | "split" | "tab",
) {
  const { activeTabId, openItemInFocusedPane, openTab, splitPane, tabs } =
    useWorkspaceStore.getState();
  if (mode === "focus") {
    openItemInFocusedPane(itemId, itemType);
    return;
  }
  if (mode === "tab") {
    openTab({ type: itemType, itemId }, { activate: true });
    return;
  }
  const tab = tabs.find((candidate) => candidate.id === activeTabId);
  if (!tab) {
    openTab({ type: itemType, itemId }, { activate: true });
    return;
  }
  splitPane(tab.id, tab.focusedPaneId, itemId, itemType, "right");
}

function OpenItemActions({ itemId, itemType }: { itemId: string; itemType: OpenableItemType }) {
  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => openHanokiItem(itemId, itemType, "focus")}
      >
        Open
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="More ways to open"
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openHanokiItem(itemId, itemType, "split")}>
            Open in split
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openHanokiItem(itemId, itemType, "tab")}>
            New tab
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function ShowFolderAction({
  folderId,
  ancestorFolderIds,
}: {
  folderId: string;
  ancestorFolderIds: string[];
}) {
  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-muted-foreground"
      onClick={() => {
        useWorkspaceStore.getState().setSidebarViewMode("tree");
        requestSidebarFolderReveal({ folderId, ancestorFolderIds });
      }}
    >
      Show in sidebar
    </Button>
  );
}

function RevertAction({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-muted-foreground"
      disabled={disabled}
      onClick={onClick}
    >
      Revert
    </Button>
  );
}

function ItemOpenAction({
  item,
  tree,
}: {
  item: Pick<ItemSummary, "kind" | "id">;
  tree: ReturnType<typeof useChatTreeIndex>;
}) {
  if (item.kind !== "folder") return <OpenItemActions itemId={item.id} itemType={item.kind} />;

  const ancestors: string[] = [];
  let parent = tree.parents.get(item.id) ?? null;
  while (parent) {
    ancestors.unshift(parent);
    parent = tree.parents.get(parent) ?? null;
  }
  return <ShowFolderAction folderId={item.id} ancestorFolderIds={ancestors} />;
}

// --- Cards ---

/** One flat result line: what it is, a quiet note beside it, actions on hover. */
function ToolResultCard({
  title,
  description,
  excerpt,
  actions,
  details,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  excerpt?: string | null;
  actions?: React.ReactNode;
  details: React.ReactNode;
}) {
  return (
    <Item size="xs" className="group/tool-row flex-nowrap gap-3 px-0 py-0.5">
      <ItemContent className="min-w-0 gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <ItemTitle className="min-w-0 text-[13px] font-normal text-foreground">{title}</ItemTitle>
          {description ? (
            <span className="shrink-0 text-xs text-muted-foreground">{description}</span>
          ) : null}
        </div>
        {excerpt ? <p className="truncate text-xs text-muted-foreground">{excerpt}</p> : null}
      </ItemContent>
      <ItemActions className="-my-1 gap-0.5 opacity-0 transition-opacity group-hover/tool-row:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100">
        {details}
        {actions}
      </ItemActions>
    </Item>
  );
}

function TruncatedName({ children }: { children: React.ReactNode }) {
  return <span className="min-w-0 truncate">{children}</span>;
}

function RenameCard({ output, label, details }: ToolResultCardProps) {
  const before = readItemSummary((output as { before?: unknown } | null)?.before);
  const after = readItemSummary((output as { after?: unknown } | null)?.after);
  const tree = useChatTreeIndex();
  const rename = useRenameChatTreeItem();

  if (!before || !after) return <ToolResultCard title={label} details={details} />;

  const current = tree.currentName(after.id);
  const noun = KIND_NOUN[after.kind];
  const isGone = tree.isSettled && current === undefined;
  const isReverted = tree.isSettled && current === before.name;
  const canRevert =
    !isGone && before.name !== after.name && (!tree.isSettled || current === after.name);

  const revert = () =>
    rename.mutate(
      { itemId: `${after.kind === "folder" ? "folder" : "item"}:${after.id}`, name: before.name },
      {
        onSuccess: () => {
          if (tree.workspaceId) notifyChatTreeChanged(tree.workspaceId);
        },
      },
    );

  return (
    <ToolResultCard
      title={
        isReverted ? (
          <TruncatedName>{before.name}</TruncatedName>
        ) : (
          <>
            <span className="min-w-0 truncate text-muted-foreground">{before.name}</span>
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <TruncatedName>{after.name}</TruncatedName>
          </>
        )
      }
      description={
        isGone ? `This ${noun} no longer exists` : isReverted ? "Name changed back" : null
      }
      details={details}
      actions={
        <>
          {canRevert ? <RevertAction disabled={rename.isPending} onClick={revert} /> : null}
          {isGone ? null : <ItemOpenAction item={after} tree={tree} />}
        </>
      }
    />
  );
}

function MoveCard({ output, label, details }: ToolResultCardProps) {
  const moved = readItemList(output, "moved").flatMap((entry) => {
    const item = readItemSummary(entry);
    if (!item) return [];
    const previous = (entry as { previousFolderId?: unknown }).previousFolderId;
    return [{ ...item, previousFolderId: previous }];
  });
  const skippedCount = readItemList(output, "skipped").length;
  const destinationId = readString(output, "destinationFolderId");
  const tree = useChatTreeIndex();
  const revert = useMutation({
    mutationFn: () =>
      Promise.all(
        moved.map((item) => {
          const previous = typeof item.previousFolderId === "string" ? item.previousFolderId : null;
          return item.kind === "folder"
            ? foldersApi.move(item.id, previous)
            : itemsApi.move(item.id, previous);
        }),
      ),
    onSuccess: () => {
      if (tree.workspaceId) notifyChatTreeChanged(tree.workspaceId);
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Couldn't move back",
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  if (moved.length === 0) {
    return <ToolResultCard title={label} details={details} />;
  }

  const only = moved.length === 1 ? moved[0] : null;
  const destination = destinationId
    ? `“${tree.folders.get(destinationId) ?? "another folder"}”`
    : "the top level";
  // Older results didn't record where items came from, so they can't be moved back.
  const hasOrigins = moved.every((item) => item.previousFolderId !== undefined);
  const isReverted =
    tree.isSettled &&
    hasOrigins &&
    moved.every((item) => (tree.parents.get(item.id) ?? null) === item.previousFolderId);
  const isStillThere =
    !tree.isSettled ||
    moved.every(
      (item) => tree.parents.has(item.id) && tree.parents.get(item.id) === (destinationId ?? null),
    );

  const summary = isReverted ? "Moved back" : `to ${destination}`;

  return (
    <ToolResultCard
      title={<TruncatedName>{listNames(moved.map((item) => item.name))}</TruncatedName>}
      description={skippedCount > 0 ? `${summary} · ${skippedCount} couldn't be moved` : summary}
      details={details}
      actions={
        <>
          {hasOrigins && isStillThere && !isReverted ? (
            <RevertAction disabled={revert.isPending} onClick={() => revert.mutate()} />
          ) : null}
          {only && tree.currentName(only.id) !== undefined ? (
            <ItemOpenAction item={only} tree={tree} />
          ) : null}
        </>
      }
    />
  );
}

function CreateCard({ output, label, details }: ToolResultCardProps) {
  const item = readItemSummary(output);
  const tree = useChatTreeIndex();

  if (!item) return <ToolResultCard title={label} details={details} />;

  const isGone = tree.isSettled && tree.currentName(item.id) === undefined;
  const folderPath = item.path?.endsWith(`/${item.name}`)
    ? item.path.slice(0, -item.name.length - 1)
    : null;
  const noun = KIND_NOUN[item.kind];

  return (
    <ToolResultCard
      title={<TruncatedName>{item.name}</TruncatedName>}
      description={
        isGone ? `This ${noun} no longer exists` : folderPath ? `in ${folderPath}` : null
      }
      details={details}
      actions={isGone ? null : <ItemOpenAction item={item} tree={tree} />}
    />
  );
}

function DeleteCard({ output, label, details }: ToolResultCardProps) {
  const deleted = readItemList(output, "deleted").flatMap((entry) => {
    const item = readItemSummary(entry);
    return item ? [item] : [];
  });
  const only = deleted.length === 1 ? deleted[0] : null;

  if (deleted.length === 0) return <ToolResultCard title={label} details={details} />;

  return (
    <ToolResultCard
      title={<TruncatedName>{listNames(deleted.map((item) => item.name))}</TruncatedName>}
      description={only ? KIND_NOUN[only.kind] : null}
      details={details}
    />
  );
}

function EditNoteCard({ output, label, details }: ToolResultCardProps) {
  const id = readString(output, "id");
  const title = readString(output, "title");
  const tree = useChatTreeIndex();
  const isGone = id !== null && tree.isSettled && tree.currentName(id) === undefined;

  return (
    <ToolResultCard
      title={<TruncatedName>{title ?? label}</TruncatedName>}
      description={readString(output, "mode") === "append" ? "added to" : "rewritten"}
      details={details}
      actions={id && !isGone ? <OpenItemActions itemId={id} itemType="markdown" /> : null}
    />
  );
}

function SendMessageCard({ output, label, details }: ToolResultCardProps) {
  const chatId = readString(output, "chatId");
  const title = readString(output, "title");
  const content = readString(output, "content");
  const started = (output as { startedGeneration?: unknown } | null)?.startedGeneration === true;
  const tree = useChatTreeIndex();
  const isGone = chatId !== null && tree.isSettled && tree.currentName(chatId) === undefined;
  const summary = started ? "Sent, reply started" : "Draft saved";

  return (
    <ToolResultCard
      title={<TruncatedName>{title ?? label}</TruncatedName>}
      description={summary}
      excerpt={content}
      details={details}
      actions={chatId && !isGone ? <OpenItemActions itemId={chatId} itemType="chat" /> : null}
    />
  );
}

/** Tools that change the workspace: their row expands into a line with actions. */
export const TOOL_RESULT_CARDS: Record<string, React.ComponentType<ToolResultCardProps>> = {
  hanokiRenameItem: RenameCard,
  hanokiMoveItems: MoveCard,
  hanokiCreateFolder: CreateCard,
  hanokiCreateChat: CreateCard,
  hanokiCreateMarkdown: CreateCard,
  hanokiCreateTerminal: CreateCard,
  hanokiDeleteItems: DeleteCard,
  hanokiEditNote: EditNoteCard,
  hanokiSendMessage: SendMessageCard,
};
