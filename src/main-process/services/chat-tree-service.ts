import {
  createChat,
  createMarkdown,
  cloneChat as cloneChatInRepo,
  createFolder,
  deleteChatTreeItems as deleteChatTreeItemsInRepo,
  deleteChat,
  deleteItem as deleteItemInRepo,
  getChatById,
  getItemById,
  getFolderById,
  getChatTreeChildren,
  getChatTree,
  listWorkspaceItemIds,
  listWorkspaceFolderIds,
  moveChat,
  moveItem as moveItemInRepo,
  moveFolder,
  updateChatSettings,
  updateChatTitle,
  updateItemTitle as updateItemTitleInRepo,
  updateMarkdownContent as updateMarkdownContentInRepo,
  updateFolderName,
  type ChatRow,
  type ItemRow,
  type MarkdownRow,
  type DeleteChatTreeItemsResult as DeleteChatTreeItemsResultRecord,
  type ChatTreeChildrenSlice as ChatTreeChildrenSliceRecord,
  type ChatTreeFolderListItem as ChatTreeFolderListItemRecord,
  type ChatTreeFolderNode as ChatTreeFolderNodeRecord,
  type ChatTreeSnapshot as ChatTreeSnapshotRecord,
  type FolderRow,
} from "../chat-tree/repository";
import { parseChatId } from "@shared/chat/chat-id";
import { parseFolderId } from "@shared/folder/folder-id";
import type {
  ChatInfo,
  ItemInfo,
  ItemLayoutNode,
  ItemPaneState,
  ChatSettingsUpdateInput,
  ChatTreeItemRef,
  ChatTreeChildrenSlice,
  ChatTreeFolderListItem,
  ChatTreeFolderNode,
  ChatTreeSnapshot,
  ChatTreeUiState,
  DeleteChatTreeItemsResult,
  FolderInfo,
  MarkdownInfo,
  TabsUiState,
  TabStateItem,
} from "@shared/ipc";
import { getWorkspaceSettings, updateWorkspaceSettings } from "../workspaces/repository";

const CHAT_TREE_EXPANDED_FOLDER_IDS_SETTINGS_KEY = "chatTreeExpandedFolderIds";
const TABS_SETTINGS_KEY = "tabs";
const ACTIVE_TAB_ID_SETTINGS_KEY = "activeTabId";
const MAX_PERSISTED_EXPANDED_FOLDER_IDS = 2000;
const MAX_PERSISTED_TABS = 20;
const MARKDOWN_AUTOSAVE_WAIT_MS = 500;

interface PendingMarkdownSave {
  markdown: string;
  timeout: ReturnType<typeof setTimeout> | null;
}

export interface ChatTreeService {
  getItem(id: string): ItemInfo;
  getChat(id: string): ChatInfo;
  getChatTree(workspaceId: string): ChatTreeSnapshot;
  getChatTreeChildren(workspaceId: string, parentFolderId: string | null): ChatTreeChildrenSlice;
  getChatTreeUiState(workspaceId: string): ChatTreeUiState;
  setChatTreeUiState(workspaceId: string, expandedFolderIds: string[]): ChatTreeUiState;
  getTabsUiState(workspaceId: string): TabsUiState;
  setTabsUiState(workspaceId: string, tabs: TabStateItem[]): TabsUiState;
  createFolder(input: { workspaceId: string; name: string; parentId: string | null }): FolderInfo;
  updateFolderName(id: string, name: string): FolderInfo;
  moveFolder(id: string, parentId: string | null): FolderInfo;
  deleteFolder(id: string): void;
  deleteChatTreeItems(workspaceId: string, items: ChatTreeItemRef[]): DeleteChatTreeItemsResult;
  createChat(input: { workspaceId: string; title: string; folderId: string | null }): ChatInfo;
  createMarkdown(input: {
    workspaceId: string;
    title: string;
    folderId: string | null;
  }): MarkdownInfo;
  queueMarkdownContent(id: string, markdown: string): void;
  flushMarkdownContent(id: string): MarkdownInfo;
  flushAllMarkdownContent(): void;
  cloneChat(chatId: string): ChatInfo;
  updateChatTitle(id: string, title: string): ChatInfo;
  updateChatSettings(id: string, settingsPatch: ChatSettingsUpdateInput): ChatInfo;
  moveChat(id: string, folderId: string | null): ChatInfo;
  deleteChat(id: string): void;
  updateItemTitle(id: string, title: string): ItemInfo;
  moveItem(id: string, folderId: string | null): ItemInfo;
  deleteItem(id: string): void;
}

function toFolderInfo(folder: FolderRow): FolderInfo {
  return {
    id: folder.id,
    workspaceId: folder.workspaceId,
    parentId: folder.parentId,
    name: folder.name,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

function toChatInfo(chat: ChatRow): ChatInfo {
  return {
    type: "chat",
    id: chat.id,
    workspaceId: chat.workspaceId,
    folderId: chat.folderId,
    title: chat.title,
    data: chat.data,
    metadata: chat.metadata,
    extensions: chat.extensions,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function toItemInfo(item: ItemRow): ItemInfo {
  if (item.type === "chat") return toChatInfo(item);
  if (item.type === "markdown") return toMarkdownInfo(item);
  return {
    type: "terminal",
    id: item.id,
    workspaceId: item.workspaceId,
    folderId: item.folderId,
    title: item.title,
    data: item.data,
    metadata: item.metadata,
    extensions: item.extensions,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toMarkdownInfo(item: MarkdownRow): MarkdownInfo {
  return {
    type: "markdown",
    id: item.id,
    workspaceId: item.workspaceId,
    folderId: item.folderId,
    title: item.title,
    data: item.data,
    metadata: item.metadata,
    extensions: item.extensions,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toChatTreeFolderNode(node: ChatTreeFolderNodeRecord): ChatTreeFolderNode {
  return {
    ...toFolderInfo(node),
    folders: node.folders.map(toChatTreeFolderNode),
    items: node.items.map(toItemInfo),
  };
}

function toChatTreeSnapshot(snapshot: ChatTreeSnapshotRecord): ChatTreeSnapshot {
  return {
    workspaceId: snapshot.workspaceId,
    rootFolders: snapshot.rootFolders.map(toChatTreeFolderNode),
    rootItems: snapshot.rootItems.map(toItemInfo),
  };
}

function toChatTreeFolderListItem(folder: ChatTreeFolderListItemRecord): ChatTreeFolderListItem {
  return {
    ...toFolderInfo(folder),
    childFolderCount: folder.childFolderCount,
    childItemCount: folder.childItemCount,
  };
}

function toChatTreeChildrenSlice(slice: ChatTreeChildrenSliceRecord): ChatTreeChildrenSlice {
  return {
    workspaceId: slice.workspaceId,
    parentFolderId: slice.parentFolderId,
    folders: slice.folders.map(toChatTreeFolderListItem),
    items: slice.items.map(toItemInfo),
  };
}

function toDeleteChatTreeItemsResult(
  result: DeleteChatTreeItemsResultRecord,
): DeleteChatTreeItemsResult {
  return {
    workspaceId: result.workspaceId,
    deletedItemIds: result.deletedItemIds,
    deletedFolderIds: result.deletedFolderIds,
  };
}

function normalizeExpandedFolderIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueFolderIds = new Set<string>();

  for (const entry of value) {
    const parsedFolderId = parseFolderId(entry);
    if (!parsedFolderId.ok) {
      continue;
    }

    uniqueFolderIds.add(parsedFolderId.value);

    if (uniqueFolderIds.size >= MAX_PERSISTED_EXPANDED_FOLDER_IDS) {
      break;
    }
  }

  return [...uniqueFolderIds].sort((left, right) => left.localeCompare(right));
}

function normalizeTabId(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function normalizeLayout(value: unknown, depth = 0): ItemLayoutNode | null {
  if (depth > 20 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = normalizeTabId(record.id);
  if (!id) return null;
  if (record.type === "pane") {
    const itemId = parseChatId(record.itemId);
    if (
      !itemId.ok ||
      (record.itemType !== "chat" &&
        record.itemType !== "terminal" &&
        record.itemType !== "markdown")
    )
      return null;
    if (record.itemType === "terminal") {
      return { id, type: "pane", itemId: itemId.value, itemType: "terminal", view: "/terminal" };
    }
    if (record.itemType === "markdown") {
      return { id, type: "pane", itemId: itemId.value, itemType: "markdown", view: "/markdown" };
    }
    const allowedViews = ["/chat", "/chat/graph", "/chat/pinned-branches", "/chat/settings"];
    const view = allowedViews.includes(record.view as string) ? record.view : "/chat";
    return {
      id,
      type: "pane",
      itemId: itemId.value,
      itemType: "chat",
      view: view as Extract<ItemPaneState, { itemType: "chat" }>["view"],
      ...(typeof record.graphMessageId === "string"
        ? { graphMessageId: record.graphMessageId }
        : {}),
    };
  }
  if (
    record.type !== "split" ||
    (record.orientation !== "horizontal" && record.orientation !== "vertical") ||
    !Array.isArray(record.children)
  ) {
    return null;
  }
  const children = record.children
    .map((child) => normalizeLayout(child, depth + 1))
    .filter((child): child is ItemLayoutNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const rawSizes = Array.isArray(record.sizes) ? record.sizes : [];
  const sizes =
    rawSizes.length === children.length &&
    rawSizes.every((size) => typeof size === "number" && Number.isFinite(size) && size > 0)
      ? (rawSizes as number[])
      : children.map(() => 100 / children.length);
  return { id, type: "split", orientation: record.orientation, children, sizes };
}

function getLayoutPanes(node: ItemLayoutNode): ItemPaneState[] {
  return node.type === "pane" ? [node] : node.children.flatMap(getLayoutPanes);
}

function normalizeTabs(value: unknown): TabStateItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenTabIds = new Set<string>();
  const normalizedTabs: TabStateItem[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const tabId = normalizeTabId(record.id);
    if (!tabId || seenTabIds.has(tabId)) {
      continue;
    }

    if (record.type !== "item") continue;
    const layout = normalizeLayout(record.layout);
    if (!layout) continue;
    const panes = getLayoutPanes(layout);
    const focusedPaneId =
      typeof record.focusedPaneId === "string" &&
      panes.some((pane) => pane.id === record.focusedPaneId)
        ? record.focusedPaneId
        : panes[0].id;

    seenTabIds.add(tabId);
    normalizedTabs.push({ id: tabId, type: "item", layout, focusedPaneId });

    if (normalizedTabs.length >= MAX_PERSISTED_TABS) {
      break;
    }
  }

  return normalizedTabs;
}

function normalizeActiveTabId(value: unknown): string | null {
  return normalizeTabId(value);
}

function pruneExpandedFolderIdsForWorkspace(workspaceId: string, ids: readonly string[]): string[] {
  if (ids.length === 0) {
    return [];
  }

  const existingFolderIds = new Set(listWorkspaceFolderIds(workspaceId, ids));
  return ids.filter((id) => existingFolderIds.has(id));
}

function pruneTabsForWorkspace(workspaceId: string, tabs: readonly TabStateItem[]): TabStateItem[] {
  if (tabs.length === 0) {
    return [];
  }

  const existingItemIds = new Set(
    listWorkspaceItemIds(
      workspaceId,
      tabs.flatMap((tab) => getLayoutPanes(tab.layout).map((p) => p.itemId)),
    ),
  );
  return tabs.flatMap((tab) => {
    const layout = pruneLayout(tab.layout, existingItemIds);
    if (!layout) return [];
    const panes = getLayoutPanes(layout);
    return [
      {
        ...tab,
        layout,
        focusedPaneId: panes.some((pane) => pane.id === tab.focusedPaneId)
          ? tab.focusedPaneId
          : panes[0].id,
      },
    ];
  });
}

function pruneLayout(node: ItemLayoutNode, itemIds: ReadonlySet<string>): ItemLayoutNode | null {
  if (node.type === "pane") return itemIds.has(node.itemId) ? node : null;
  const children = node.children
    .map((child) => pruneLayout(child, itemIds))
    .filter((child): child is ItemLayoutNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children, sizes: children.map(() => 100 / children.length) };
}

export function createChatTreeService(): ChatTreeService {
  const pendingMarkdownSaves = new Map<string, PendingMarkdownSave>();

  function discardPendingMarkdownSave(id: string): void {
    const pending = pendingMarkdownSaves.get(id);
    if (pending?.timeout) clearTimeout(pending.timeout);
    pendingMarkdownSaves.delete(id);
  }

  function flushPendingMarkdownContent(id: string): MarkdownInfo {
    const pending = pendingMarkdownSaves.get(id);
    if (!pending) {
      const item = getItemById(id);
      if (!item) throw new Error(`Item "${id}" does not exist.`);
      if (item.type !== "markdown") throw new Error(`Item "${id}" is not Markdown.`);
      return toMarkdownInfo(item);
    }

    if (pending.timeout) clearTimeout(pending.timeout);
    const saved = toMarkdownInfo(updateMarkdownContentInRepo(id, pending.markdown));
    pendingMarkdownSaves.delete(id);
    return saved;
  }

  function queuePendingMarkdownContent(id: string, markdown: string): void {
    discardPendingMarkdownSave(id);
    const pending: PendingMarkdownSave = { markdown, timeout: null };
    pending.timeout = setTimeout(() => {
      pending.timeout = null;
      try {
        flushPendingMarkdownContent(id);
      } catch (error) {
        console.error(`[markdown] Autosave failed for item "${id}".`, error);
      }
    }, MARKDOWN_AUTOSAVE_WAIT_MS);
    pendingMarkdownSaves.set(id, pending);
  }

  function flushAllPendingMarkdownContent(): void {
    const errors: unknown[] = [];
    for (const id of pendingMarkdownSaves.keys()) {
      try {
        flushPendingMarkdownContent(id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more Markdown documents could not be saved.");
    }
  }

  function applyDeletionUiCleanup(result: DeleteChatTreeItemsResultRecord): void {
    for (const itemId of result.deletedItemIds) discardPendingMarkdownSave(itemId);
    const currentUiState = readChatTreeUiState(result.workspaceId);
    const deletedFolderIds = new Set(result.deletedFolderIds);
    const nextExpandedFolderIds = currentUiState.expandedFolderIds.filter(
      (folderId) => !deletedFolderIds.has(folderId),
    );

    if (nextExpandedFolderIds.length !== currentUiState.expandedFolderIds.length) {
      writeChatTreeUiState(result.workspaceId, nextExpandedFolderIds);
    }

    const workspaceSettings = getWorkspaceSettings(result.workspaceId);
    const currentTabs = normalizeTabs(workspaceSettings[TABS_SETTINGS_KEY]);
    const deletedItemIds = new Set(result.deletedItemIds);
    const nextTabs = currentTabs.flatMap((tab) => {
      const layout = pruneLayout(
        tab.layout,
        new Set(
          getLayoutPanes(tab.layout)
            .map((pane) => pane.itemId)
            .filter((id) => !deletedItemIds.has(id)),
        ),
      );
      if (!layout) return [];
      const panes = getLayoutPanes(layout);
      return [
        {
          ...tab,
          layout,
          focusedPaneId: panes.some((pane) => pane.id === tab.focusedPaneId)
            ? tab.focusedPaneId
            : panes[0].id,
        },
      ];
    });

    const paneCount = (tabs: readonly TabStateItem[]) =>
      tabs.reduce((count, tab) => count + getLayoutPanes(tab.layout).length, 0);
    if (paneCount(nextTabs) !== paneCount(currentTabs)) {
      writeTabsUiState(result.workspaceId, nextTabs);
    }
  }

  function readChatTreeUiState(workspaceId: string): ChatTreeUiState {
    const workspaceSettings = getWorkspaceSettings(workspaceId);
    const normalizedFolderIds = normalizeExpandedFolderIds(
      workspaceSettings[CHAT_TREE_EXPANDED_FOLDER_IDS_SETTINGS_KEY],
    );

    return {
      expandedFolderIds: pruneExpandedFolderIdsForWorkspace(workspaceId, normalizedFolderIds),
    };
  }

  function writeChatTreeUiState(workspaceId: string, expandedFolderIds: unknown): ChatTreeUiState {
    const normalizedFolderIds = normalizeExpandedFolderIds(expandedFolderIds);
    const prunedFolderIds = pruneExpandedFolderIdsForWorkspace(workspaceId, normalizedFolderIds);

    updateWorkspaceSettings(workspaceId, {
      [CHAT_TREE_EXPANDED_FOLDER_IDS_SETTINGS_KEY]: prunedFolderIds,
    });

    return {
      expandedFolderIds: prunedFolderIds,
    };
  }

  function readTabsUiState(workspaceId: string): TabsUiState {
    const workspaceSettings = getWorkspaceSettings(workspaceId);
    const normalizedTabs = normalizeTabs(workspaceSettings[TABS_SETTINGS_KEY]);
    const prunedTabs = pruneTabsForWorkspace(workspaceId, normalizedTabs);

    const storedActiveTabId = normalizeActiveTabId(workspaceSettings[ACTIVE_TAB_ID_SETTINGS_KEY]);
    return {
      tabs: prunedTabs,
      activeTabId: prunedTabs.some((tab) => tab.id === storedActiveTabId)
        ? storedActiveTabId
        : (prunedTabs[0]?.id ?? null),
    };
  }

  function writeTabsUiState(workspaceId: string, tabs: unknown): TabsUiState {
    const workspaceSettings = getWorkspaceSettings(workspaceId);
    const normalizedTabs = normalizeTabs(tabs);
    const prunedTabs = pruneTabsForWorkspace(workspaceId, normalizedTabs);
    const storedActiveTabId = normalizeActiveTabId(workspaceSettings[ACTIVE_TAB_ID_SETTINGS_KEY]);
    const activeTabId = prunedTabs.some((tab) => tab.id === storedActiveTabId)
      ? storedActiveTabId
      : (prunedTabs[0]?.id ?? null);

    updateWorkspaceSettings(workspaceId, {
      [TABS_SETTINGS_KEY]: prunedTabs,
      [ACTIVE_TAB_ID_SETTINGS_KEY]: activeTabId,
    });

    return {
      tabs: prunedTabs,
      activeTabId,
    };
  }

  return {
    getItem(id: string): ItemInfo {
      const item = getItemById(id);
      if (!item) throw new Error(`Item "${id}" does not exist.`);
      return toItemInfo(item);
    },

    getChat(id: string): ChatInfo {
      const chat = getChatById(id);
      if (!chat) {
        throw new Error(`Chat "${id}" does not exist.`);
      }

      return toChatInfo(chat);
    },

    getChatTree(workspaceId: string): ChatTreeSnapshot {
      return toChatTreeSnapshot(getChatTree(workspaceId));
    },

    getChatTreeChildren(workspaceId: string, parentFolderId: string | null): ChatTreeChildrenSlice {
      return toChatTreeChildrenSlice(getChatTreeChildren(workspaceId, parentFolderId));
    },

    getChatTreeUiState(workspaceId: string): ChatTreeUiState {
      return readChatTreeUiState(workspaceId);
    },

    setChatTreeUiState(workspaceId: string, expandedFolderIds: string[]): ChatTreeUiState {
      return writeChatTreeUiState(workspaceId, expandedFolderIds);
    },

    getTabsUiState(workspaceId: string): TabsUiState {
      return readTabsUiState(workspaceId);
    },

    setTabsUiState(workspaceId: string, tabs: TabStateItem[]): TabsUiState {
      return writeTabsUiState(workspaceId, tabs);
    },

    createFolder(input): FolderInfo {
      return toFolderInfo(createFolder(input));
    },

    updateFolderName(id: string, name: string): FolderInfo {
      return toFolderInfo(updateFolderName(id, name));
    },

    moveFolder(id: string, parentId: string | null): FolderInfo {
      return toFolderInfo(moveFolder(id, parentId));
    },

    deleteFolder(id: string): void {
      const folder = getFolderById(id);
      if (!folder) {
        throw new Error(`Folder "${id}" does not exist.`);
      }

      const deletionResult = deleteChatTreeItemsInRepo(folder.workspaceId, [
        { kind: "folder", id },
      ]);
      applyDeletionUiCleanup(deletionResult);
    },

    deleteChatTreeItems(workspaceId: string, items: ChatTreeItemRef[]): DeleteChatTreeItemsResult {
      const deletionResult = deleteChatTreeItemsInRepo(workspaceId, items);
      applyDeletionUiCleanup(deletionResult);
      return toDeleteChatTreeItemsResult(deletionResult);
    },

    createChat(input): ChatInfo {
      return toChatInfo(createChat(input));
    },

    createMarkdown(input): MarkdownInfo {
      return toMarkdownInfo(createMarkdown(input));
    },

    queueMarkdownContent(id: string, markdown: string): void {
      queuePendingMarkdownContent(id, markdown);
    },

    flushMarkdownContent(id: string): MarkdownInfo {
      return flushPendingMarkdownContent(id);
    },

    flushAllMarkdownContent(): void {
      flushAllPendingMarkdownContent();
    },

    cloneChat(chatId: string): ChatInfo {
      return toChatInfo(cloneChatInRepo(chatId));
    },

    updateChatTitle(id: string, title: string): ChatInfo {
      return toChatInfo(updateChatTitle(id, title));
    },

    updateChatSettings(id: string, settingsPatch: ChatSettingsUpdateInput): ChatInfo {
      return toChatInfo(updateChatSettings(id, settingsPatch));
    },

    moveChat(id: string, folderId: string | null): ChatInfo {
      return toChatInfo(moveChat(id, folderId));
    },

    deleteChat(id: string): void {
      const deletedChat = deleteChat(id);
      applyDeletionUiCleanup({
        workspaceId: deletedChat.workspaceId,
        deletedItemIds: [deletedChat.id],
        deletedFolderIds: [],
      });
    },

    updateItemTitle(id: string, title: string): ItemInfo {
      return toItemInfo(updateItemTitleInRepo(id, title));
    },

    moveItem(id: string, folderId: string | null): ItemInfo {
      return toItemInfo(moveItemInRepo(id, folderId));
    },

    deleteItem(id: string): void {
      const deleted = deleteItemInRepo(id);
      applyDeletionUiCleanup({
        workspaceId: deleted.workspaceId,
        deletedItemIds: [deleted.id],
        deletedFolderIds: [],
      });
    },
  };
}
