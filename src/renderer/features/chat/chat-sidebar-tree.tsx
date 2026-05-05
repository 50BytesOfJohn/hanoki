import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useTree } from "@headless-tree/react";
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
  ArrowDown01Icon,
  ArrowRight01Icon,
  Chat01Icon,
  FolderAddIcon,
  Folder01Icon,
  Folder02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemIcon,
  TreeItemLabel,
  TreeItemRenameInput,
} from "@/components/ui/tree";
import { chatTreeApi } from "@/api/chat-tree";
import { useChatStatus } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
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
import { useWorkspaceStore } from "../workspace/store";

type ChatTreeNodeData =
  | { kind: "folder"; folder: ChatTreeFolderListItem }
  | { kind: "chat"; chat: ChatInfo }
  | { kind: "root" }
  | { kind: "loading" };

const ROOT_ITEM_ID = "root";

export function ChatSidebarTree() {
  const workspaceState = useWorkspaceStore((s) => s.state);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const expandedTreeNodes = useWorkspaceStore((s) => s.expandedTreeNodes);

  const workspaceId = workspace?.id;

  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-(--window-toolbar-height) h-[calc(100svh-var(--window-toolbar-height))] border-r-0"
    >
      <SidebarContent>
        {!workspaceId ? (
          <p className="px-2 py-2 text-sidebar-foreground/70 text-xs">Select a workspace.</p>
        ) : workspaceState === "loading" ? null : (
          <ChatSidebarTreeInner
            key={workspaceId}
            workspaceId={workspaceId}
            initialExpandedFolderIds={expandedTreeNodes}
          />
        )}
      </SidebarContent>
    </Sidebar>
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

  const [expandedItems, setExpandedItems] = React.useState<string[]>(() =>
    initialExpandedFolderIds.map((id) => `folder:${id}`),
  );
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);
  const [renamingItem, setRenamingItemRaw] = React.useState<string | null | undefined>(null);
  const [renamingValue, setRenamingValueRaw] = React.useState<string | undefined>("");
  const [pendingDeleteItems, setPendingDeleteItems] = React.useState<ChatTreeItemRef[] | null>(
    null,
  );
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

  const openChat = React.useCallback(
    (chatId: string, mode: "auto" | "new-tab") => {
      openTab(
        {
          type: "chat",
          chatId,
        },
        { mode },
      );
    },
    [openTab],
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
      <div className="flex items-center gap-1 px-2">
        <InputGroup className="w-full">
          <InputGroupInput name="search" placeholder="Search tree..." type="text" />

          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} className="size-3" />
          </InputGroupAddon>
        </InputGroup>

        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Add chat to root"
          onClick={() => {
            createChat(null);
          }}
        >
          <HugeiconsIcon icon={Add01Icon} />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Add folder to root"
          onClick={() => {
            createFolder(null);
          }}
        >
          <HugeiconsIcon icon={FolderAddIcon} />
        </Button>
      </div>

      {visibleItems.length === 0 ? (
        <p className="px-2 py-2 text-sidebar-foreground/70 text-xs">No chats or folders yet.</p>
      ) : (
        <Tree
          className="relative min-h-0 flex-1 gap-0.5 pb-8 px-1"
          {...mergeProps<"div">(tree.getContainerProps("Chat tree"), {
            onKeyDown: handleTreeKeyDown,
          })}
        >
          <TreeDragLine style={tree.getDragLineStyle()} />
          {visibleItems.map((item) => {
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
                  openChat(data.chat.id, "new-tab");
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
                <TreeItem key={item.getKey()} level={depth} {...item.getProps()}>
                  {data.kind === "chat" ? (
                    <ChatTreeItemIcon chatId={data.chat.id} />
                  ) : data.kind === "folder" ? (
                    <>
                      <TreeItemIcon className="text-muted-foreground opacity-50">
                        <HugeiconsIcon icon={ArrowRight01Icon} />
                      </TreeItemIcon>
                      <TreeItemIcon className="text-muted-foreground">
                        <HugeiconsIcon icon={Folder01Icon} />
                      </TreeItemIcon>
                    </>
                  ) : null}
                  <TreeItemRenameInput {...item.getRenameInputProps()} />
                </TreeItem>
              );
            }

            if (data.kind === "chat") {
              const chatItemProps = mergeProps<"div">(item.getProps(), {
                onClick: (event) => {
                  if (event.defaultPrevented || isSelectionModifierEvent(event)) {
                    return;
                  }

                  openChat(data.chat.id, "auto");
                },
                onContextMenu: handleContextMenu,
              });

              return (
                <TreeItem
                  key={item.getKey()}
                  level={depth}
                  {...chatItemProps}
                  data-selected={item.isSelected() || undefined}
                  data-drop-target={item.isDragTarget() || undefined}
                >
                  <ChatTreeItemIcon chatId={data.chat.id} />
                  <TreeItemLabel>{data.chat.title}</TreeItemLabel>
                </TreeItem>
              );
            }

            if (data.kind === "folder") {
              const isExpanded = item.isExpanded();
              const hasChildren = data.folder.childFolderCount + data.folder.childChatCount > 0;
              const folderItemProps = mergeProps<"div">(item.getProps(), {
                onContextMenu: handleContextMenu,
              });

              return (
                <TreeItem
                  key={item.getKey()}
                  level={depth}
                  {...folderItemProps}
                  data-selected={item.isSelected() || undefined}
                  data-drop-target={item.isDragTarget() || undefined}
                >
                  <TreeItemIcon
                    className={cn("text-muted-foreground", !hasChildren && "opacity-50")}
                  >
                    <HugeiconsIcon icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon} />
                  </TreeItemIcon>
                  <TreeItemIcon className="text-muted-foreground">
                    <HugeiconsIcon icon={isExpanded ? Folder02Icon : Folder01Icon} />
                  </TreeItemIcon>
                  <TreeItemLabel>{data.folder.name}</TreeItemLabel>
                </TreeItem>
              );
            }

            return null;
          })}
        </Tree>
      )}
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
    <TreeItemIcon className="text-muted-foreground">
      {isActive ? (
        <span className="flex size-4 items-center justify-center">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
        </span>
      ) : (
        <HugeiconsIcon icon={Chat01Icon} />
      )}
    </TreeItemIcon>
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
    <AlertDialog open={itemCount > 0} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Selected Items</AlertDialogTitle>
          <AlertDialogDescription>
            {`This will permanently delete ${itemCount} selected ${itemCount === 1 ? "item" : "items"}.`}
            {hasFolders
              ? " Selected folders will also delete all nested chats and subfolders."
              : ""}
            {" This action cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={isPending}>
            Cancel
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
