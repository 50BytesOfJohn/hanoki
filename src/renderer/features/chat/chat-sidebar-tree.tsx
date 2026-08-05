import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useTree } from "@headless-tree/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  asyncDataLoaderFeature,
  dragAndDropFeature,
  expandAllFeature,
  hotkeysCoreFeature,
  renamingFeature,
  selectionFeature,
} from "@headless-tree/core";
import type { ItemInstance } from "@headless-tree/core";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ChatAdd01Icon,
  Copy01Icon,
  Delete02Icon,
  Folder01Icon,
  FolderAddIcon,
  LayoutBottomIcon,
  LayoutLeftIcon,
  LayoutRightIcon,
  LayoutTopIcon,
  MessagesSquare,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Search01Icon,
  SplitIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ChatActivityIndicator } from "./chat-activity-indicator";
import { useHotkey } from "@tanstack/react-hotkeys";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

import { chatTreeApi } from "@/api/chat-tree";
import { useChatStatus } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { queryKeys } from "@/queries/keys";
import {
  useDeleteChatTreeItems,
  useMoveChat,
  useMoveFolder,
  useRenameChatTreeItem,
  useSetChatTreeUiState,
} from "@/mutations/chat-tree";
import { useCreateChat, useCloneChat } from "@/mutations/chats";
import { useCreateFolder } from "@/mutations/folders";

import type {
  ChatInfo,
  ChatSidebarViewMode,
  ChatTreeFolderListItem,
  ChatTreeFolderNode,
  ChatTreeItemRef,
  ChatTreeSnapshot,
} from "@shared/ipc";
import {
  CHAT_TREE_FOLDER_PLACEMENTS,
  CHAT_TREE_SORT_ORDERS,
  getChatTreeSortOrderLabel,
  isChatTreeFolderPlacement,
  isChatTreeSortOrder,
  sortChatTreeEntries,
} from "@shared/chat/chat-tree-sort";
import type { ChatTreeSortEntry } from "@shared/chat/chat-tree-sort";
import {
  ChatSidebar,
  ChatSidebarBlock,
  ChatSidebarBlockContent,
  ChatSidebarPanel,
} from "./chat-sidebar";
import { useChatTreeSort } from "./use-chat-tree-sort";
import { ChatSearchDialog } from "./chat-search-dialog";
import { CHAT_DRAG_FORMAT, ChatTabsSidebarList, useChatTabsPosition } from "./chat-tabs";
import { subscribeToChatTitleUpdates } from "./chat-title-events";
import { useWorkspaceStore } from "../workspace/store";

type ChatTreeNodeData =
  | { kind: "folder"; folder: ChatTreeFolderListItem }
  | { kind: "chat"; chat: ChatInfo }
  | { kind: "root" }
  | { kind: "loading" };

const ROOT_ITEM_ID = "root";
const SIDEBAR_ICON_BUTTON_CLASS =
  "size-5 min-w-0 shrink-0 rounded p-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5";

type ChatTreeContextMenuAction =
  | "add-folder"
  | "add-chat"
  | "open-in-focused-pane"
  | "open-in-new-tab"
  | "open-to-left"
  | "open-to-right"
  | "open-above"
  | "open-below"
  | "clone"
  | "rename"
  | "delete";

function ChatTreeItemContextMenu({
  children,
  itemKind,
  onAction,
}: {
  children: React.ReactElement;
  itemKind: "folder" | "chat";
  onAction: (action: ChatTreeContextMenuAction) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-48">
        {itemKind === "folder" ? (
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => onAction("add-folder")}>
              <HugeiconsIcon icon={FolderAddIcon} />
              Add Folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAction("add-chat")}>
              <HugeiconsIcon icon={ChatAdd01Icon} />
              Add Chat
            </ContextMenuItem>
          </ContextMenuGroup>
        ) : (
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => onAction("open-in-new-tab")}>
              <HugeiconsIcon icon={Add01Icon} />
              Open in New Tab
            </ContextMenuItem>
            <ContextMenuItem inset onClick={() => onAction("open-in-focused-pane")}>
              Open in Focused Pane
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <HugeiconsIcon icon={SplitIcon} />
                Open in Split View
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                <ContextMenuGroup>
                  <ContextMenuItem onClick={() => onAction("open-to-left")}>
                    <HugeiconsIcon icon={LayoutLeftIcon} />
                    Open to the Left
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => onAction("open-to-right")}>
                    <HugeiconsIcon icon={LayoutRightIcon} />
                    Open to the Right
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => onAction("open-above")}>
                    <HugeiconsIcon icon={LayoutTopIcon} />
                    Open Above
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => onAction("open-below")}>
                    <HugeiconsIcon icon={LayoutBottomIcon} />
                    Open Below
                  </ContextMenuItem>
                </ContextMenuGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuGroup>
        )}
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>Manage</ContextMenuLabel>
          {itemKind === "chat" ? (
            <ContextMenuItem onClick={() => onAction("clone")}>
              <HugeiconsIcon icon={Copy01Icon} />
              Clone
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onClick={() => onAction("rename")}>
            <HugeiconsIcon icon={PencilEdit01Icon} />
            Rename
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => onAction("delete")}>
            <HugeiconsIcon icon={Delete02Icon} />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ChatSidebarTree() {
  const workspaceState = useWorkspaceStore((s) => s.state);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const expandedTreeNodes = useWorkspaceStore((s) => s.expandedTreeNodes);
  const workspaceViewMode = useWorkspaceStore((s) => s.sidebarViewMode);
  const { data: globalChatSettings } = useQuery(globalChatSettingsQueryOptions);

  const viewMode: ChatSidebarViewMode =
    workspaceViewMode ?? globalChatSettings?.sidebarViewMode ?? "tree";
  const workspaceId = workspace?.id;
  // Sort preferences gate the tree so it never renders in a stale order first.
  const { isPending: isSortPending } = useChatTreeSort(workspaceId ?? "");

  return (
    <ChatSidebar>
      <ChatSidebarPanel>
        {!workspaceId ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Select a workspace.</p>
        ) : workspaceState === "loading" ? null : viewMode === "activity" ? (
          <ChatSidebarActivity key={`activity:${workspaceId}`} workspaceId={workspaceId} />
        ) : isSortPending ? null : (
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

function ChatSidebarViewModeMenu({
  workspaceId,
  viewMode,
  onExpandAll,
  onCollapseAll,
}: {
  workspaceId: string;
  viewMode: ChatSidebarViewMode;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}) {
  const setSidebarViewMode = useWorkspaceStore((s) => s.setSidebarViewMode);
  const { sortOrder, folderPlacement, setSortOrder, setFolderPlacement } =
    useChatTreeSort(workspaceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Sidebar options"
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} />
      </DropdownMenuTrigger>
      {/* Fixed width + start alignment: the active sort label must not move the popup. */}
      <DropdownMenuContent side="bottom" align="start" className="w-64">
        <DropdownMenuRadioGroup
          value={viewMode}
          onValueChange={(value) => {
            if (value === "tree" || value === "activity") {
              setSidebarViewMode(value);
            }
          }}
        >
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuRadioItem value="tree">Folder tree</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="activity">Recent activity</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {viewMode === "tree" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span className="flex-1">Sort</span>
                <span className="min-w-0 truncate ps-4 text-muted-foreground text-xs">
                  {getChatTreeSortOrderLabel(sortOrder)}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={sortOrder}
                  onValueChange={(value) => {
                    if (isChatTreeSortOrder(value)) {
                      setSortOrder(value);
                    }
                  }}
                >
                  <DropdownMenuLabel>Sort chats by</DropdownMenuLabel>
                  {CHAT_TREE_SORT_ORDERS.map((order) => (
                    <DropdownMenuRadioItem key={order.id} value={order.id}>
                      {order.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={folderPlacement}
                  onValueChange={(value) => {
                    if (isChatTreeFolderPlacement(value)) {
                      setFolderPlacement(value);
                    }
                  }}
                >
                  <DropdownMenuLabel>Folder placement</DropdownMenuLabel>
                  {CHAT_TREE_FOLDER_PLACEMENTS.map((placement) => (
                    <DropdownMenuRadioItem key={placement.id} value={placement.id}>
                      {placement.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
        {onExpandAll && onCollapseAll ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Folders</DropdownMenuLabel>
              <DropdownMenuItem onClick={onExpandAll}>Expand all folders</DropdownMenuItem>
              <DropdownMenuItem onClick={onCollapseAll}>Collapse all folders</DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const tabs = useWorkspaceStore((s) => s.tabs);
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
  const [searchOpen, setSearchOpen] = React.useState(false);
  const selectedItemIdSet = React.useMemo(() => new Set(selectedItems), [selectedItems]);

  const { sortOrder, folderPlacement } = useChatTreeSort(workspaceId);
  const sortRef = React.useRef({ sortOrder, folderPlacement });

  useHotkey("Mod+K", () => {
    setSearchOpen(true);
  });

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
      expandAllFeature,
    ],
    state: { expandedItems, renamingItem, renamingValue, selectedItems },
    setExpandedItems,
    setSelectedItems,
    setRenamingItem,
    setRenamingValue,
    canReorder: false,
    // Lets chats be dragged onto foreign drop targets like the tab bar.
    createForeignDragObject: (items) => ({
      format: CHAT_DRAG_FORMAT,
      data: JSON.stringify(
        items
          .map((item) => item.getId())
          .filter((id) => id.startsWith("chat:"))
          .map((id) => id.slice("chat:".length)),
      ),
    }),
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
        const entries: ChatTreeSortEntry<{ id: string; data: ChatTreeNodeData }>[] = [
          ...slice.folders.map((folder) => ({
            isFolder: true,
            key: folder,
            value: { id: `folder:${folder.id}`, data: { kind: "folder" as const, folder } },
          })),
          ...slice.chats.map((chat) => ({
            isFolder: false,
            key: { ...chat, name: chat.title },
            value: { id: `chat:${chat.id}`, data: { kind: "chat" as const, chat } },
          })),
        ];

        // Read through a ref: the loader is memoized by the tree, sort changes rebuild it below.
        return sortChatTreeEntries(
          entries,
          sortRef.current.sortOrder,
          sortRef.current.folderPlacement,
        );
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

  React.useEffect(
    () =>
      subscribeToChatTitleUpdates((event) => {
        if (event.workspaceId !== workspaceId) {
          return;
        }

        invalidateTree();
        tree.rebuildTree();
      }),
    [invalidateTree, tree, workspaceId],
  );

  // Children are ordered as they load, so a sort change has to reload the loaded levels.
  React.useEffect(() => {
    const applied = sortRef.current;
    sortRef.current = { sortOrder, folderPlacement };
    if (applied.sortOrder === sortOrder && applied.folderPlacement === folderPlacement) {
      return;
    }

    invalidateTree();
    tree.rebuildTree();
  }, [folderPlacement, invalidateTree, sortOrder, tree]);

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
    (chatId: string, options?: { activate?: boolean }) => {
      openTab({ type: "chat", chatId }, options);
    },
    [openTab],
  );

  const navigateToChat = React.useCallback(
    (chatId: string) => {
      setCurrentChat(chatId);
    },
    [setCurrentChat],
  );

  const openChatBeside = React.useCallback(
    (chatId: string, direction: "left" | "right" | "top" | "bottom") => {
      const tab = tabs.find((candidate) => candidate.id === activeTabId);
      if (!tab) {
        openTab({ type: "chat", chatId });
        return;
      }
      splitPane(tab.id, tab.focusedPaneId, chatId, direction);
    },
    [activeTabId, openTab, splitPane, tabs],
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
      {/* No gap: the header owns its own leading, so a gap here would push the label
          further from its rows than the rows sit from each other. Groups space themselves. */}
      <ChatSidebarBlock className="pt-1">
        <ChatTabsSection />

        <ChatSidebarSectionHeader title="Chats">
          <Button
            size="icon-xs"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Search chats (⌘K)"
            onClick={() => {
              setSearchOpen(true);
            }}
          >
            <HugeiconsIcon icon={Search01Icon} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Add chat to root"
            onClick={() => {
              void createChat(null);
            }}
          >
            <HugeiconsIcon icon={ChatAdd01Icon} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Add folder to root"
            onClick={() => {
              void createFolder(null);
            }}
          >
            <HugeiconsIcon icon={FolderAddIcon} />
          </Button>
          <ChatSidebarViewModeMenu
            workspaceId={workspaceId}
            viewMode="tree"
            onExpandAll={() => {
              void tree.expandAll();
            }}
            onCollapseAll={() => {
              tree.collapseAll();
            }}
          />
        </ChatSidebarSectionHeader>

        {visibleItems.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No chats or folders yet.</p>
        ) : (
          <ChatSidebarBlockContent className="px-1 py-1">
            <ChatTreeView
              className="relative pb-8"
              {...mergeProps<"div">(tree.getContainerProps("Chat tree"), {
                onKeyDown: handleTreeKeyDown,
              })}
            >
              <ChatTreeDragLine style={tree.getDragLineStyle()} />
              {visibleItems.map((item) => {
                const data = item.getItemData();
                const depth = getItemDepth(item);

                if (data.kind === "loading" || !item.hasLoadedData()) {
                  return null;
                }

                const handleContextMenuAction = (action: ChatTreeContextMenuAction) => {
                  const itemKind = data.kind === "folder" ? "folder" : "chat";
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
                  } else if (action === "open-in-focused-pane" && data.kind === "chat") {
                    navigateToChat(data.chat.id);
                  } else if (action === "open-in-new-tab" && data.kind === "chat") {
                    openChatInTab(data.chat.id);
                  } else if (action === "open-to-left" && data.kind === "chat") {
                    openChatBeside(data.chat.id, "left");
                  } else if (action === "open-to-right" && data.kind === "chat") {
                    openChatBeside(data.chat.id, "right");
                  } else if (action === "open-above" && data.kind === "chat") {
                    openChatBeside(data.chat.id, "top");
                  } else if (action === "open-below" && data.kind === "chat") {
                    openChatBeside(data.chat.id, "bottom");
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
                };

                if (item.isRenaming()) {
                  return (
                    <ChatTreeItemRow key={item.getKey()} level={depth} {...item.getProps()}>
                      {data.kind === "chat" ? (
                        <ChatTreeItemIcon chatId={data.chat.id} />
                      ) : data.kind === "folder" ? (
                        <ChatTreeItemIconFrame className="text-muted-foreground/60">
                          <HugeiconsIcon
                            icon={item.isExpanded() ? ArrowDown01Icon : Folder01Icon}
                          />
                        </ChatTreeItemIconFrame>
                      ) : null}
                      <Input
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
                    onDoubleClick: (event) => {
                      if (event.defaultPrevented || isSelectionModifierEvent(event)) {
                        return;
                      }

                      event.preventDefault();
                      openChatInTab(data.chat.id);
                    },
                    onMouseDown: (event) => {
                      // Prevent middle-click autoscroll.
                      if (event.button === 1) {
                        event.preventDefault();
                      }
                    },
                    onAuxClick: (event) => {
                      if (
                        event.button !== 1 ||
                        event.defaultPrevented ||
                        isSelectionModifierEvent(event)
                      ) {
                        return;
                      }

                      event.preventDefault();
                      openChatInTab(data.chat.id, { activate: false });
                    },
                  });

                  return (
                    <ChatTreeItemContextMenu
                      key={item.getKey()}
                      itemKind="chat"
                      onAction={handleContextMenuAction}
                    >
                      <ChatTreeItemRow
                        level={depth}
                        {...chatItemProps}
                        data-active={isActiveChat || undefined}
                        data-drop-target={item.isDragTarget() || undefined}
                      >
                        <ChatTreeItemIcon chatId={data.chat.id} />
                        <ChatTreeItemLabel>{data.chat.title}</ChatTreeItemLabel>
                      </ChatTreeItemRow>
                    </ChatTreeItemContextMenu>
                  );
                }

                if (data.kind === "folder") {
                  const isExpanded = item.isExpanded();
                  const hasChildren = data.folder.childFolderCount + data.folder.childChatCount > 0;
                  const folderItemProps = item.getProps();

                  return (
                    <ChatTreeItemContextMenu
                      key={item.getKey()}
                      itemKind="folder"
                      onAction={handleContextMenuAction}
                    >
                      <ChatTreeItemRow
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
                    </ChatTreeItemContextMenu>
                  );
                }

                return null;
              })}
            </ChatTreeView>
          </ChatSidebarBlockContent>
        )}
      </ChatSidebarBlock>
      <ChatSearchDialog
        workspaceId={workspaceId}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectChat={navigateToChat}
      />
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

/* ── Activity view ── */

export function flattenSnapshotChats(snapshot: ChatTreeSnapshot): ChatInfo[] {
  const chats: ChatInfo[] = [];

  const walk = (folders: ChatTreeFolderNode[], folderChats: ChatInfo[]) => {
    chats.push(...folderChats);
    for (const folder of folders) {
      walk(folder.folders, folder.chats);
    }
  };

  walk(snapshot.rootFolders, snapshot.rootChats);
  return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

interface ActivitySection {
  label: string;
  chats: ChatInfo[];
}

function groupChatsByActivity(chats: ChatInfo[]): ActivitySection[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const buckets = [
    { label: "Today", from: startOfToday },
    { label: "Last 7 days", from: startOfToday - 6 * dayMs },
    { label: "Last 30 days", from: startOfToday - 29 * dayMs },
    { label: "Older", from: Number.NEGATIVE_INFINITY },
  ].map((bucket) => ({ ...bucket, chats: [] as ChatInfo[] }));

  for (const chat of chats) {
    const bucket = buckets.find((candidate) => chat.updatedAt >= candidate.from);
    bucket?.chats.push(chat);
  }

  return buckets.filter((bucket) => bucket.chats.length > 0);
}

function ChatSidebarActivity({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const openTab = useWorkspaceStore((s) => s.openTab);
  const setCurrentChat = useWorkspaceStore((s) => s.setCurrentChat);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const currentChatId = useWorkspaceStore((s) => s.currentChatId);

  const createChatMutation = useCreateChat();
  const cloneChatMutation = useCloneChat();
  const deleteItemsMutation = useDeleteChatTreeItems();
  const renameChatTreeItem = useRenameChatTreeItem();

  const [searchOpen, setSearchOpen] = React.useState(false);
  const [pendingDeleteItems, setPendingDeleteItems] = React.useState<ChatTreeItemRef[] | null>(
    null,
  );
  const [renamingChat, setRenamingChat] = React.useState<{ id: string; value: string } | null>(
    null,
  );

  useHotkey("Mod+K", () => {
    setSearchOpen(true);
  });

  const { data: chats = [] } = useQuery({
    queryKey: queryKeys.chatTree.snapshot(workspaceId),
    queryFn: () => chatTreeApi.getTree(workspaceId),
    select: flattenSnapshotChats,
  });

  const sections = React.useMemo(() => groupChatsByActivity(chats), [chats]);

  const invalidateSnapshot = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chatTree.snapshot(workspaceId) });
  }, [queryClient, workspaceId]);

  // Re-sort when the active chat finishes streaming, so it bubbles to the top.
  const currentChatStatus = useChatStatus(currentChatId ?? "");
  const previousStatusRef = React.useRef(currentChatStatus);
  React.useEffect(() => {
    const wasActive =
      previousStatusRef.current === "streaming" || previousStatusRef.current === "submitted";
    previousStatusRef.current = currentChatStatus;
    if (wasActive && currentChatStatus === "ready") {
      invalidateSnapshot();
    }
  }, [currentChatStatus, invalidateSnapshot]);

  const commitRename = React.useCallback(() => {
    if (!renamingChat) {
      return;
    }

    const trimmed = renamingChat.value.trim();
    setRenamingChat(null);
    if (trimmed.length === 0) {
      return;
    }

    renameChatTreeItem.mutate(
      { itemId: `chat:${renamingChat.id}`, name: trimmed },
      { onSuccess: invalidateSnapshot },
    );
  }, [invalidateSnapshot, renameChatTreeItem, renamingChat]);

  const handleContextMenuAction = React.useCallback(
    (chat: ChatInfo) => (action: ChatTreeContextMenuAction) => {
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      const openBeside = (direction: "left" | "right" | "top" | "bottom") => {
        if (activeTab) splitPane(activeTab.id, activeTab.focusedPaneId, chat.id, direction);
        else openTab({ type: "chat", chatId: chat.id });
      };
      if (action === "open-in-focused-pane") {
        setCurrentChat(chat.id);
      } else if (action === "open-in-new-tab") {
        openTab({ type: "chat", chatId: chat.id });
      } else if (action === "open-to-left") {
        openBeside("left");
      } else if (action === "open-to-right") {
        openBeside("right");
      } else if (action === "open-above") {
        openBeside("top");
      } else if (action === "open-below") {
        openBeside("bottom");
      } else if (action === "clone") {
        void cloneChatMutation.mutateAsync({ id: chat.id }).then(invalidateSnapshot);
      } else if (action === "rename") {
        setRenamingChat({ id: chat.id, value: chat.title });
      } else if (action === "delete") {
        setPendingDeleteItems([{ kind: "chat", id: chat.id }]);
      }
    },
    [activeTabId, cloneChatMutation, invalidateSnapshot, openTab, setCurrentChat, splitPane, tabs],
  );

  const handleDeleteConfirm = React.useCallback(() => {
    if (!pendingDeleteItems || pendingDeleteItems.length === 0) {
      return;
    }

    deleteItemsMutation.mutate(
      { workspaceId, items: pendingDeleteItems },
      {
        onSettled: () => {
          setPendingDeleteItems(null);
        },
      },
    );
  }, [deleteItemsMutation, pendingDeleteItems, workspaceId]);

  return (
    <>
      <ChatSidebarBlock className="pt-1">
        <ChatTabsSection />

        <ChatSidebarSectionHeader title="Chats">
          <Button
            size="icon-xs"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Search chats (⌘K)"
            onClick={() => {
              setSearchOpen(true);
            }}
          >
            <HugeiconsIcon icon={Search01Icon} />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className={SIDEBAR_ICON_BUTTON_CLASS}
            aria-label="Add chat"
            onClick={() => {
              void createChatMutation
                .mutateAsync({ workspaceId, title: "New chat", folderId: null })
                .then(invalidateSnapshot);
            }}
          >
            <HugeiconsIcon icon={ChatAdd01Icon} />
          </Button>
          <ChatSidebarViewModeMenu workspaceId={workspaceId} viewMode="activity" />
        </ChatSidebarSectionHeader>

        {sections.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No chats yet.</p>
        ) : (
          <ChatSidebarBlockContent className="px-1 py-1">
            <div className="flex flex-col gap-2 pb-8">
              {sections.map((section) => (
                <section key={section.label}>
                  <h3 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                    {section.label}
                  </h3>
                  <div className="flex flex-col gap-0.5">
                    {section.chats.map((chat) =>
                      renamingChat?.id === chat.id ? (
                        <div key={chat.id} className="flex h-7 items-center gap-1.5 px-2">
                          <ChatTreeItemIcon chatId={chat.id} />
                          <Input
                            autoFocus
                            className="h-7 min-w-0 flex-1 px-2 text-sm"
                            value={renamingChat.value}
                            onChange={(event) => {
                              setRenamingChat({ id: chat.id, value: event.target.value });
                            }}
                            onBlur={commitRename}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                commitRename();
                              }
                              if (event.key === "Escape") {
                                setRenamingChat(null);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <ChatActivityListItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === currentChatId}
                          onSelect={() => setCurrentChat(chat.id)}
                          onOpenInTab={(options) =>
                            openTab({ type: "chat", chatId: chat.id }, options)
                          }
                          onContextMenuAction={handleContextMenuAction(chat)}
                        />
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
          </ChatSidebarBlockContent>
        )}
      </ChatSidebarBlock>
      <ChatSearchDialog
        workspaceId={workspaceId}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectChat={setCurrentChat}
      />
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

function ChatActivityListItem({
  chat,
  isActive,
  onSelect,
  onOpenInTab,
  onContextMenuAction,
}: {
  chat: ChatInfo;
  isActive: boolean;
  onSelect: () => void;
  onOpenInTab: (options?: { activate?: boolean }) => void;
  onContextMenuAction: (action: ChatTreeContextMenuAction) => void;
}) {
  return (
    <ChatTreeItemContextMenu itemKind="chat" onAction={onContextMenuAction}>
      <div
        role="button"
        tabIndex={0}
        draggable
        aria-pressed={isActive}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(CHAT_DRAG_FORMAT, JSON.stringify([chat.id]));
          event.dataTransfer.setData("text/plain", chat.title);
        }}
        onClick={onSelect}
        onDoubleClick={(event) => {
          event.preventDefault();
          onOpenInTab();
        }}
        onMouseDown={(event) => {
          // Prevent middle-click autoscroll.
          if (event.button === 1) {
            event.preventDefault();
          }
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) {
            return;
          }

          event.preventDefault();
          onOpenInTab({ activate: false });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "group/tree-item relative flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] outline-hidden select-none transition-colors duration-100",
          "hover:bg-hover",
          isActive ? "bg-surface-tertiary text-foreground" : "text-foreground/75",
        )}
      >
        <ChatTreeItemIcon chatId={chat.id} />
        <ChatTreeItemLabel>{chat.title}</ChatTreeItemLabel>
      </div>
    </ChatTreeItemContextMenu>
  );
}

function ChatTreeItemIcon({ chatId }: { chatId: string }) {
  const status = useChatStatus(chatId);
  const isActive = status === "streaming" || status === "submitted";

  return (
    <ChatTreeItemIconFrame className="text-muted-foreground">
      {isActive ? <ChatActivityIndicator /> : <HugeiconsIcon icon={MessagesSquare} />}
    </ChatTreeItemIconFrame>
  );
}

function ChatTabsSection() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const tabsPosition = useChatTabsPosition();

  if (tabsPosition !== "sidebar" || tabs.length === 0) {
    return null;
  }

  return (
    // pb-2 separates this group from the Chats header below it — the block no
    // longer supplies a gap, so each group carries its own trailing space.
    <section className="shrink-0 pb-2">
      <ChatSidebarSectionHeader title="Tabs" />
      <ChatTabsSidebarList />
    </section>
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
    <div className={cn("flex flex-col [--tree-indent:16px]", className)} role="tree" {...props} />
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
          // One hairline per ancestor level, each centred on that ancestor's icon
          // slot. Rows are flush (no gap), so the hairlines read as continuous rails.
          ...(level > 0 && {
            backgroundImage:
              "repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px var(--tree-indent))",
            // 0.5rem row padding + half of the 20px icon slot.
            backgroundPosition: "1.125rem 0",
            backgroundSize: `calc(var(--tree-indent) * ${level}) 100%`,
            backgroundRepeat: "no-repeat",
          }),
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
  // An empty folder has nothing to disclose, so the slot shows what the row *is*
  // rather than sitting blank next to chats that do have an icon.
  if (!hasChildren) {
    return (
      <ChatTreeItemIconFrame className="text-muted-foreground/60">
        <HugeiconsIcon icon={Folder01Icon} />
      </ChatTreeItemIconFrame>
    );
  }

  return (
    <Button
      size="icon-xs"
      variant="ghost"
      className={cn(SIDEBAR_ICON_BUTTON_CLASS, "text-muted-foreground")}
      aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <HugeiconsIcon icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon} />
    </Button>
  );
}

function ChatTreeItemIconFrame({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        // size-5 matches the disclosure button in SIDEBAR_ICON_BUTTON_CLASS: chat
        // icons, folder chevrons and empty-folder icons share one 20px column, so
        // every label at a given depth starts at the same x.
        "flex size-5 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0",
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
    <AlertDialog open={itemCount > 0} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-[360px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Selected Items</AlertDialogTitle>
          <AlertDialogDescription>
            {`This will permanently delete ${itemCount} selected ${
              itemCount === 1 ? "item" : "items"
            }.`}
            {hasFolders
              ? " Selected folders will also delete all nested chats and subfolders."
              : ""}
            {" This action cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isPending} onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
