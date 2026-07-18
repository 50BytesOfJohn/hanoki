import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useTree } from "@headless-tree/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  asyncDataLoaderFeature,
  dragAndDropFeature,
  hotkeysCoreFeature,
  renamingFeature,
  selectionFeature,
} from "@headless-tree/core";
import type { ItemInstance } from "@headless-tree/core";
import {
  AddSquareIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Chat01Icon,
  ChatAdd01Icon,
  FolderAddIcon,
  MoreHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

import { chatTreeApi } from "@/api/chat-tree";
import { useChatStatus } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { getChatQueryOptions } from "@/queries/chats";
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
import type { Tab } from "../workspace/store/types";
import {
  ChatSidebar,
  ChatSidebarBlock,
  ChatSidebarBlockContent,
  ChatSidebarPanel,
} from "./chat-sidebar";
import { ChatSearchDialog } from "./chat-search-dialog";
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

export function ChatSidebarTree() {
  const workspaceState = useWorkspaceStore((s) => s.state);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const expandedTreeNodes = useWorkspaceStore((s) => s.expandedTreeNodes);
  const workspaceViewMode = useWorkspaceStore((s) => s.sidebarViewMode);
  const { data: globalChatSettings } = useQuery(globalChatSettingsQueryOptions);

  const viewMode: ChatSidebarViewMode =
    workspaceViewMode ?? globalChatSettings?.sidebarViewMode ?? "tree";
  const workspaceId = workspace?.id;

  return (
    <ChatSidebar>
      <ChatSidebarPanel>
        {!workspaceId ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Select a workspace.</p>
        ) : workspaceState === "loading" ? null : viewMode === "activity" ? (
          <ChatSidebarActivity key={`activity:${workspaceId}`} workspaceId={workspaceId} />
        ) : (
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

function ChatSidebarViewModeMenu({ viewMode }: { viewMode: ChatSidebarViewMode }) {
  const setSidebarViewMode = useWorkspaceStore((s) => s.setSidebarViewMode);

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
      <DropdownMenuContent side="bottom" align="end">
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
      <ChatSidebarBlock className="gap-2 pt-1">
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
          <ChatSidebarViewModeMenu viewMode="tree" />
        </ChatSidebarSectionHeader>

        {visibleItems.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No chats or folders yet.</p>
        ) : (
          <ChatSidebarBlockContent className="px-1 py-1">
            <ChatTreeView
              className="relative gap-0.5 pb-8"
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
                        size="icon-xs"
                        variant="ghost"
                        className={cn(
                          SIDEBAR_ICON_BUTTON_CLASS,
                          "opacity-0 transition-opacity group-hover/tree-item:opacity-100 focus-visible:opacity-100",
                        )}
                        aria-label={`Open ${data.chat.title} in new tab`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
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

function flattenSnapshotChats(snapshot: ChatTreeSnapshot): ChatInfo[] {
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

  const handleContextMenu = React.useCallback(
    (chat: ChatInfo) => (event: React.MouseEvent) => {
      event.preventDefault();
      void chatTreeApi.showContextMenu(`chat:${chat.id}`, "chat").then((action) => {
        if (action === "open-in-new-tab") {
          openTab({ type: "chat", chatId: chat.id });
        } else if (action === "clone") {
          void cloneChatMutation.mutateAsync({ id: chat.id }).then(invalidateSnapshot);
        } else if (action === "rename") {
          setRenamingChat({ id: chat.id, value: chat.title });
        } else if (action === "delete") {
          setPendingDeleteItems([{ kind: "chat", id: chat.id }]);
        }
      });
    },
    [cloneChatMutation, invalidateSnapshot, openTab],
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
      <ChatSidebarBlock className="gap-2 pt-1">
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
          <ChatSidebarViewModeMenu viewMode="activity" />
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
                          onOpenInTab={() => openTab({ type: "chat", chatId: chat.id })}
                          onContextMenu={handleContextMenu(chat)}
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
  onContextMenu,
}: {
  chat: ChatInfo;
  isActive: boolean;
  onSelect: () => void;
  onOpenInTab: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group/tree-item relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] outline-hidden select-none transition-colors duration-100",
        "hover:bg-hover",
        isActive ? "bg-surface-tertiary text-foreground" : "text-foreground/75",
      )}
    >
      <ChatTreeItemIcon chatId={chat.id} />
      <ChatTreeItemLabel>{chat.title}</ChatTreeItemLabel>
      <Button
        size="icon-xs"
        variant="ghost"
        className={cn(
          SIDEBAR_ICON_BUTTON_CLASS,
          "opacity-0 transition-opacity group-hover/tree-item:opacity-100 focus-visible:opacity-100",
        )}
        aria-label={`Open ${chat.title} in new tab`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenInTab();
        }}
      >
        <HugeiconsIcon icon={AddSquareIcon} />
      </Button>
    </div>
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

function ChatTabsSection() {
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
  onSelect,
  onClose,
}: {
  tab: Tab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const chatQuery = useQuery(getChatQueryOptions(tab.chatId));
  const title = chatQuery.data?.title ?? "Loading…";

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
        size="icon-xs"
        variant="ghost"
        className={cn(
          SIDEBAR_ICON_BUTTON_CLASS,
          "opacity-0 transition-opacity group-hover/tab:opacity-100",
          isActive && "opacity-50 group-hover/tab:opacity-100",
        )}
        aria-label={`Close ${title} tab`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
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
