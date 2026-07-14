import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useTree } from "@headless-tree/react";
import { useQuery } from "@tanstack/react-query";
import {
  asyncDataLoaderFeature,
  dragAndDropFeature,
  hotkeysCoreFeature,
  renamingFeature,
  selectionFeature,
} from "@headless-tree/core";
import type { ItemInstance } from "@headless-tree/core";
import {
  Add01Icon,
  AddSquareIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Chat01Icon,
  FolderAddIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertDialog, Button, Input, SearchField } from "@heroui/react";

import { chatTreeApi } from "@/api/chat-tree";
import { useChatStatus } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { getChatQueryOptions } from "@/queries/chats";
import {
  useDeleteChatTreeItems,
  useMoveChat,
  useMoveFolder,
  useRenameChatTreeItem,
  useSetChatTreeUiState,
} from "@/mutations/chat-tree";
import { useCreateChat, useCloneChat } from "@/mutations/chats";
import { useCreateFolder } from "@/mutations/folders";

import type { ChatInfo, ChatTreeFolderListItem, ChatTreeItemRef } from "@shared/ipc";
import type { Tab } from "../workspace/store/types";
import {
  ChatSidebar,
  ChatSidebarBlock,
  ChatSidebarBlockContent,
  ChatSidebarBlockHeader,
  ChatSidebarPanel,
} from "./chat-sidebar";
import { useWorkspaceStore } from "../workspace/store";

type ChatTreeNodeData =
  | { kind: "folder"; folder: ChatTreeFolderListItem }
  | { kind: "chat"; chat: ChatInfo }
  | { kind: "root" }
  | { kind: "loading" };

const ROOT_ITEM_ID = "root";
const SIDEBAR_ICON_BUTTON_CLASS =
  "size-5 min-w-0 shrink-0 rounded p-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5";

export function ChatSidebarTree() {
  const workspaceState = useWorkspaceStore((s) => s.state);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const expandedTreeNodes = useWorkspaceStore((s) => s.expandedTreeNodes);

  const workspaceId = workspace?.id;

  return (
    <ChatSidebar>
      <ChatSidebarPanel>
        {!workspaceId ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Select a workspace.</p>
        ) : workspaceState === "loading" ? null : (
          <ChatSidebarTreeInner
            key={workspaceId}
            workspaceId={workspaceId}
            initialExpandedFolderIds={expandedTreeNodes}
          />
        )}
      </ChatSidebarPanel>
    </ChatSidebar>
  );
}

function ChatSidebarTreeInner({
  workspaceId,
  initialExpandedFolderIds,
}: {
  workspaceId: string;
  initialExpandedFolderIds: string[];
}) {
  const setChatTreeUiState = useSetChatTreeUiState();

  const deleteItemsMutation = useDeleteChatTreeItems();
  const renameChatTreeItem = useRenameChatTreeItem();
  const moveFolderMutation = useMoveFolder();
  const moveChatMutation = useMoveChat();
  const createChatMutation = useCreateChat();
  const cloneChatMutation = useCloneChat();
  const createFolderMutation = useCreateFolder();

  const openTab = useWorkspaceStore((s) => s.openTab);
  const setCurrentChat = useWorkspaceStore((s) => s.setCurrentChat);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);

  const [expandedItems, setExpandedItems] = React.useState<string[]>(() =>
    initialExpandedFolderIds.map((id) => `folder:${id}`),
  );
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);
  const [renamingItem, setRenamingItemRaw] = React.useState<string | null | undefined>(null);
  const [renamingValue, setRenamingValueRaw] = React.useState<string | undefined>("");
  const [pendingDeleteItems, setPendingDeleteItems] = React.useState<ChatTreeItemRef[] | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const selectedItemIdSet = React.useMemo(() => new Set(selectedItems), [selectedItems]);

  const setRenamingItem = React.useCallback(
    (
      updater:
        | string
        | null
        | undefined
        | ((old: string | null | undefined) => string | null | undefined),
    ) => {
      setRenamingItemRaw((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [],
  );

  const setRenamingValue = React.useCallback(
    (updater: string | undefined | ((old: string | undefined) => string | undefined)) => {
      setRenamingValueRaw((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [],
  );

  const expandedItemsEvent = React.useEffectEvent((newExpandedItems: string[]) => {
    const folderIds = newExpandedItems
      .filter((id) => id.startsWith("folder:"))
      .map((id) => id.slice("folder:".length));
    setChatTreeUiState.mutate({
      workspaceId,
      expandedFolderIds: folderIds,
    });
  });

  React.useEffect(() => {
    expandedItemsEvent(expandedItems);
  }, [expandedItems]);

  const tree = useTree<ChatTreeNodeData>({
    rootItemId: ROOT_ITEM_ID,
    features: [
      asyncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      renamingFeature,
      dragAndDropFeature,
    ],
    state: { expandedItems, renamingItem, renamingValue, selectedItems },
    setExpandedItems,
    setSelectedItems,
    setRenamingItem,
    setRenamingValue,
    canReorder: false,
    canDrop: (items, target) => {
      const targetId = target.item.getId();
      // Only allow dropping on folders or root
      if (targetId !== ROOT_ITEM_ID && !targetId.startsWith("folder:")) {
        return false;
      }
      // Prevent dropping a folder into itself or its descendants
      for (const item of items) {
        if (item.getId() === targetId) return false;
        let parent = target.item.getParent();
        while (parent) {
          if (parent.getId() === item.getId()) return false;
          parent = parent.getParent();
        }
      }
      return true;
    },
    onDrop: async (items, target) => {
      const targetId = target.item.getId();
      const targetFolderId = targetId === ROOT_ITEM_ID ? null : targetId.slice("folder:".length);

      for (const item of items) {
        const itemId = item.getId();
        if (itemId.startsWith("folder:")) {
          await moveFolderMutation.mutateAsync({
            id: itemId.slice("folder:".length),
            parentId: targetFolderId,
          });
        } else if (itemId.startsWith("chat:")) {
          await moveChatMutation.mutateAsync({
            id: itemId.slice("chat:".length),
            folderId: targetFolderId,
          });
        }
      }

      // Invalidate caches for old parents and new target
      for (const item of items) {
        item.getParent()?.invalidateChildrenIds();
      }
      target.item.invalidateChildrenIds();
      tree.rebuildTree();
    },
    onRename: (item, value) => {
      const itemId = item.getId();
      renameChatTreeItem.mutate(
        { itemId, name: value },
        {
          onSuccess: () => {
            void item.getParent()?.invalidateChildrenIds();
          },
        },
      );
    },
    isItemFolder: (item) => {
      const id = item.getId();
      return id === ROOT_ITEM_ID || id.startsWith("folder:");
    },
    getItemName: (item) => {
      const data = item.getItemData();
      if (data.kind === "folder") return data.folder.name;
      if (data.kind === "chat") return data.chat.title;
      if (data.kind === "loading") return "Loading…";

      return "";
    },
    createLoadingItemData: () => ({ kind: "loading" as const }),
    dataLoader: {
      getItem: (itemId) => {
        if (itemId === ROOT_ITEM_ID) return { kind: "root" as const };
        return { kind: "loading" as const };
      },
      getChildrenWithData: async (itemId) => {
        const parentFolderId = itemId === ROOT_ITEM_ID ? null : itemId.slice("folder:".length);
        const slice = await chatTreeApi.getChildren(workspaceId, parentFolderId);
        return [
          ...slice.folders.map((folder) => ({
            id: `folder:${folder.id}`,
            data: { kind: "folder" as const, folder },
          })),
          ...slice.chats.map((chat) => ({
            id: `chat:${chat.id}`,
            data: { kind: "chat" as const, chat },
          })),
        ];
      },
    },
  });

  const items = tree.getItems();
  const visibleItems = items.filter((item) => item.getId() !== ROOT_ITEM_ID);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredItems = React.useMemo(() => {
    if (!normalizedSearchQuery) {
      return visibleItems;
    }

    return visibleItems.filter((item) =>
      item.getItemName().toLocaleLowerCase().includes(normalizedSearchQuery),
    );
  }, [normalizedSearchQuery, visibleItems]);

  const invalidateTree = React.useCallback(() => {
    void tree.getRootItem().invalidateChildrenIds();
    for (const item of tree.getItems()) {
      if (item.isFolder()) {
        void item.invalidateChildrenIds();
      }
    }
  }, [tree]);

  const openDeleteDialog = React.useCallback((itemIds: readonly string[]) => {
    const itemRefs = itemIds
      .map(parseTreeItemRef)
      .filter((item): item is ChatTreeItemRef => item !== null);
    if (itemRefs.length === 0) {
      return;
    }

    setPendingDeleteItems(itemRefs);
  }, []);

  const createChat = React.useCallback(
    async (folderId: string | null) => {
      await createChatMutation.mutateAsync({
        workspaceId,
        title: "New chat",
        folderId,
      });
      invalidateTree();
    },
    [createChatMutation, invalidateTree, workspaceId],
  );

  const createFolder = React.useCallback(
    async (parentId: string | null) => {
      const folder = await createFolderMutation.mutateAsync({
        workspaceId,
        name: "New Folder",
        parentId,
      });
      setRenamingItem(`folder:${folder.id}`);
      setRenamingValue("New Folder");
      invalidateTree();
    },
    [createFolderMutation, invalidateTree, setRenamingItem, setRenamingValue, workspaceId],
  );

  const openChatInTab = React.useCallback(
    (chatId: string) => {
      openTab({ type: "chat", chatId });
    },
    [openTab],
  );

  const navigateToChat = React.useCallback(
    (chatId: string) => {
      setCurrentChat(chatId);
    },
    [setCurrentChat],
  );

  const handleDeleteConfirm = React.useCallback(() => {
    if (!pendingDeleteItems || pendingDeleteItems.length === 0) {
      return;
    }

    deleteItemsMutation.mutate(
      {
        workspaceId,
        items: pendingDeleteItems,
      },
      {
        onSuccess: () => {
          setSelectedItems([]);
          invalidateTree();
          tree.rebuildTree();
        },
        onSettled: () => {
          setPendingDeleteItems(null);
        },
      },
    );
  }, [deleteItemsMutation, invalidateTree, pendingDeleteItems, tree, workspaceId]);

  const handleTreeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Backspace" || pendingDeleteItems || selectedItems.length === 0) {
        return;
      }

      if (!(event.target instanceof HTMLElement) || isEditableElement(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openDeleteDialog(selectedItems);
    },
    [openDeleteDialog, pendingDeleteItems, selectedItems],
  );

  return (
    <>
      <ChatSidebarBlock className="gap-2">
        <ChatSidebarBlockHeader className="space-y-2">
          <SearchField
            aria-label="Search chats"
            className="min-w-0"
            fullWidth
            name="search"
            value={searchQuery}
            variant="secondary"
            onChange={setSearchQuery}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search chats…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </ChatSidebarBlockHeader>

        <ChatTabsSection normalizedSearchQuery={normalizedSearchQuery} />

        <ChatSidebarSectionHeader title="Chats">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Add chat to root"
            onPress={() => {
              void createChat(null);
            }}
          >
            <HugeiconsIcon icon={Add01Icon} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Add folder to root"
            onPress={() => {
              void createFolder(null);
            }}
          >
            <HugeiconsIcon icon={FolderAddIcon} />
          </Button>
        </ChatSidebarSectionHeader>

        {visibleItems.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No chats or folders yet.</p>
        ) : filteredItems.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No matching chats or folders.</p>
        ) : (
          <ChatSidebarBlockContent className="px-1 py-1">
            <ChatTreeView
              className="relative gap-0.5 pb-8"
              {...mergeProps<"div">(tree.getContainerProps("Chat tree"), {
                onKeyDown: handleTreeKeyDown,
              })}
            >
              <ChatTreeDragLine style={tree.getDragLineStyle()} />
              {filteredItems.map((item) => {
                const data = item.getItemData();
                const depth = getItemDepth(item);

                if (data.kind === "loading" || !item.hasLoadedData()) {
                  return null;
                }

                const handleContextMenu = (e: React.MouseEvent) => {
                  e.preventDefault();
                  const itemKind = data.kind === "folder" ? "folder" : "chat";
                  void chatTreeApi.showContextMenu(item.getId(), itemKind).then((action) => {
                    const ensureFolderExpanded = () => {
                      const folderItemId = item.getId();
                      setExpandedItems((prev) =>
                        prev.includes(folderItemId) ? prev : [...prev, folderItemId],
                      );
                    };

                    if (action === "add-folder" && itemKind === "folder") {
                      ensureFolderExpanded();
                      void createFolder(item.getId().slice("folder:".length));
                    } else if (action === "add-chat" && itemKind === "folder") {
                      ensureFolderExpanded();
                      void createChat(item.getId().slice("folder:".length));
                    } else if (action === "open-in-new-tab" && data.kind === "chat") {
                      openChatInTab(data.chat.id);
                    } else if (action === "clone" && data.kind === "chat") {
                      void cloneChatMutation.mutateAsync({ id: data.chat.id }).then(() => {
                        invalidateTree();
                      });
                    } else if (action === "rename") {
                      item.startRenaming();
                    } else if (action === "delete") {
                      openDeleteDialog(
                        selectedItemIdSet.has(item.getId()) && selectedItems.length > 1
                          ? selectedItems
                          : [item.getId()],
                      );
                    }
                  });
                };

                if (item.isRenaming()) {
                  return (
                    <ChatTreeItemRow key={item.getKey()} level={depth} {...item.getProps()}>
                      {data.kind === "chat" ? (
                        <ChatTreeItemIcon chatId={data.chat.id} />
                      ) : data.kind === "folder" ? (
                        <ChatTreeItemIconFrame className="text-muted-foreground opacity-50">
                          <HugeiconsIcon icon={ArrowRight01Icon} />
                        </ChatTreeItemIconFrame>
                      ) : null}
                      <Input
                        variant="secondary"
                        className="h-7 min-w-0 flex-1 px-2 text-sm"
                        {...item.getRenameInputProps()}
                      />
                    </ChatTreeItemRow>
                  );
                }

                if (data.kind === "chat") {
                  const isActiveChat = data.chat.id === currentChatId;
                  const chatItemProps = mergeProps<"div">(item.getProps(), {
                    onClick: (event) => {
                      if (event.defaultPrevented || isSelectionModifierEvent(event)) {
                        return;
                      }

                      navigateToChat(data.chat.id);
                    },
                    onContextMenu: handleContextMenu,
                  });

                  return (
                    <ChatTreeItemRow
                      key={item.getKey()}
                      level={depth}
                      {...chatItemProps}
                      data-active={isActiveChat || undefined}
                      data-drop-target={item.isDragTarget() || undefined}
                    >
                      <ChatTreeItemIcon chatId={data.chat.id} />
                      <ChatTreeItemLabel>{data.chat.title}</ChatTreeItemLabel>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        className={cn(
                          SIDEBAR_ICON_BUTTON_CLASS,
                          "opacity-0 transition-opacity group-hover/tree-item:opacity-100 data-[focus-visible=true]:opacity-100",
                        )}
                        aria-label={`Open ${data.chat.title} in new tab`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPress={() => {
                          openChatInTab(data.chat.id);
                        }}
                      >
                        <HugeiconsIcon icon={AddSquareIcon} />
                      </Button>
                    </ChatTreeItemRow>
                  );
                }

                if (data.kind === "folder") {
                  const isExpanded = item.isExpanded();
                  const hasChildren = data.folder.childFolderCount + data.folder.childChatCount > 0;
                  const folderItemProps = mergeProps<"div">(item.getProps(), {
                    onContextMenu: handleContextMenu,
                  });

                  return (
                    <ChatTreeItemRow
                      key={item.getKey()}
                      level={depth}
                      {...folderItemProps}
                      data-selected={item.isSelected() || undefined}
                      data-drop-target={item.isDragTarget() || undefined}
                    >
                      <ChatTreeDisclosureButton
                        hasChildren={hasChildren}
                        isExpanded={isExpanded}
                        onToggle={() => {
                          if (isExpanded) {
                            item.collapse();
                          } else {
                            item.expand();
                          }
                        }}
                      />
                      <ChatTreeItemLabel className="font-medium">
                        {data.folder.name}
                      </ChatTreeItemLabel>
                    </ChatTreeItemRow>
                  );
                }

                return null;
              })}
            </ChatTreeView>
          </ChatSidebarBlockContent>
        )}
      </ChatSidebarBlock>
      <DeleteTreeItemsDialog
        items={pendingDeleteItems}
        isPending={deleteItemsMutation.isPending}
        onClose={() => {
          if (!deleteItemsMutation.isPending) {
            setPendingDeleteItems(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

function ChatTreeItemIcon({ chatId }: { chatId: string }) {
  const status = useChatStatus(chatId);
  const isActive = status === "streaming" || status === "submitted";

  return (
    <ChatTreeItemIconFrame className="text-muted-foreground">
      {isActive ? (
        <span className="flex size-4 items-center justify-center">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
        </span>
      ) : (
        <HugeiconsIcon icon={Chat01Icon} />
      )}
    </ChatTreeItemIconFrame>
  );
}

function ChatTabsSection({ normalizedSearchQuery }: { normalizedSearchQuery: string }) {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);
  const setCurrentChat = useWorkspaceStore((s) => s.setCurrentChat);
  const closeTab = useWorkspaceStore((s) => s.closeTab);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <section className="shrink-0">
      <ChatSidebarSectionHeader title="Tabs" />

      <div className="flex flex-col gap-0.5 px-1">
        {tabs.map((tab) => (
          <ChatTabListItem
            key={tab.id}
            tab={tab}
            isActive={currentChatId === tab.chatId}
            normalizedSearchQuery={normalizedSearchQuery}
            onSelect={() => setCurrentChat(tab.chatId)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ChatTabListItem({
  tab,
  isActive,
  normalizedSearchQuery,
  onSelect,
  onClose,
}: {
  tab: Tab;
  isActive: boolean;
  normalizedSearchQuery: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  const chatQuery = useQuery(getChatQueryOptions(tab.chatId));
  const title = chatQuery.data?.title ?? "Loading…";

  if (normalizedSearchQuery && !title.toLocaleLowerCase().includes(normalizedSearchQuery)) {
    return null;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group/tab relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] outline-hidden select-none transition-colors duration-100",
        "hover:bg-hover",
        isActive ? "bg-surface-tertiary text-foreground" : "text-foreground/75",
      )}
    >
      <span className="flex shrink-0 items-center justify-center text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5">
        <HugeiconsIcon icon={Chat01Icon} />
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className={cn(
          SIDEBAR_ICON_BUTTON_CLASS,
          "opacity-0 transition-opacity group-hover/tab:opacity-100",
          isActive && "opacity-50 group-hover/tab:opacity-100",
        )}
        aria-label={`Close ${title} tab`}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onPress={onClose}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  );
}

function ChatSidebarSectionHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-2 px-3">
      <h2 className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h2>
      {children ? <div className="flex shrink-0 items-center gap-1">{children}</div> : null}
    </div>
  );
}

function ChatTreeView({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col [--tree-indent:12px]", className)} role="tree" {...props} />
  );
}

function ChatTreeItemRow({
  className,
  level = 0,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  level?: number;
}) {
  return (
    <div
      className={cn(
        "group/tree-item relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] outline-hidden select-none transition-colors duration-100",
        "text-foreground/75 data-[active=true]:bg-surface-tertiary data-[active=true]:text-foreground",
        "data-[focused=true]:ring-1 data-[focused=true]:ring-focus/60",
        "data-[drop-target=true]:bg-hover data-[drop-target=true]:ring-1 data-[drop-target=true]:ring-muted/30 data-[drop-target=true]:ring-dashed",
        "hover:bg-hover",
        className,
      )}
      role="treeitem"
      style={
        {
          ...style,
          "--tree-level": level,
          paddingInlineStart: `calc(var(--tree-indent) * ${level} + 0.5rem)`,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

function ChatTreeDisclosureButton({
  hasChildren,
  isExpanded,
  onToggle,
}: {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!hasChildren) {
    return <span className="size-5 shrink-0" aria-hidden />;
  }

  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      className={cn(SIDEBAR_ICON_BUTTON_CLASS, "text-muted-foreground")}
      aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPress={onToggle}
    >
      <HugeiconsIcon icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon} />
    </Button>
  );
}

function ChatTreeItemIconFrame({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ChatTreeItemLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("min-w-0 flex-1 truncate", className)} {...props} />;
}

function ChatTreeDragLine({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("pointer-events-none absolute right-0 left-0 h-0.5 bg-primary", className)}
      {...props}
    />
  );
}

function getItemDepth(item: ItemInstance<ChatTreeNodeData>): number {
  let depth = 0;
  let current = item.getParent();
  while (current && current.getParent()) {
    depth++;
    current = current.getParent();
  }
  return depth;
}

function parseTreeItemRef(itemId: string): ChatTreeItemRef | null {
  if (itemId.startsWith("chat:")) {
    return { kind: "chat", id: itemId.slice("chat:".length) };
  }

  if (itemId.startsWith("folder:")) {
    return { kind: "folder", id: itemId.slice("folder:".length) };
  }

  return null;
}

function isSelectionModifierEvent(event: React.MouseEvent<HTMLElement>): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

function isEditableElement(element: HTMLElement): boolean {
  return (
    element.isContentEditable ||
    element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") !==
      null
  );
}

function DeleteTreeItemsDialog({
  items,
  isPending,
  onClose,
  onConfirm,
}: {
  items: ChatTreeItemRef[] | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const itemCount = items?.length ?? 0;
  const hasFolders = items?.some((item) => item.kind === "folder") ?? false;

  return (
    <AlertDialog isOpen={itemCount > 0} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[360px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete Selected Items</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {`This will permanently delete ${itemCount} selected ${
                  itemCount === 1 ? "item" : "items"
                }.`}
                {hasFolders
                  ? " Selected folders will also delete all nested chats and subfolders."
                  : ""}
                {" This action cannot be undone."}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button isDisabled={isPending} slot="close" variant="secondary">
                Cancel
              </Button>
              <Button isDisabled={isPending} variant="danger" onPress={onConfirm}>
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
