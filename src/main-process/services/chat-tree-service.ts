import {
  createChat,
  cloneChat as cloneChatInRepo,
  createFolder,
  deleteChatTreeItems as deleteChatTreeItemsInRepo,
  deleteChat,
  getChatById,
  getFolderById,
  getChatTreeChildren,
  getChatTree,
  listWorkspaceChatIds,
  listWorkspaceFolderIds,
  moveChat,
  moveFolder,
  updateChatSettings,
  updateChatTitle,
  updateFolderName,
  type ChatRow,
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
  ChatLayoutNode,
  ChatPaneState,
  ChatSettingsUpdateInput,
  ChatTreeItemRef,
  ChatTreeChildrenSlice,
  ChatTreeFolderListItem,
  ChatTreeFolderNode,
  ChatTreeSnapshot,
  ChatTreeUiState,
  DeleteChatTreeItemsResult,
  FolderInfo,
  TabsUiState,
  TabStateItem,
} from "@shared/ipc";
import { getWorkspaceSettings, updateWorkspaceSettings } from "../workspaces/repository";

const CHAT_TREE_EXPANDED_FOLDER_IDS_SETTINGS_KEY = "chatTreeExpandedFolderIds";
const TABS_SETTINGS_KEY = "tabs";
const ACTIVE_TAB_ID_SETTINGS_KEY = "activeTabId";
const MAX_PERSISTED_EXPANDED_FOLDER_IDS = 2000;
const MAX_PERSISTED_TABS = 20;

export interface ChatTreeService {
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
  cloneChat(chatId: string): ChatInfo;
  updateChatTitle(id: string, title: string): ChatInfo;
  updateChatSettings(id: string, settingsPatch: ChatSettingsUpdateInput): ChatInfo;
  moveChat(id: string, folderId: string | null): ChatInfo;
  deleteChat(id: string): void;
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
    id: chat.id,
    workspaceId: chat.workspaceId,
    folderId: chat.folderId,
    title: chat.title,
    settings: chat.settings,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function toChatTreeFolderNode(node: ChatTreeFolderNodeRecord): ChatTreeFolderNode {
  return {
    ...toFolderInfo(node),
    folders: node.folders.map(toChatTreeFolderNode),
    chats: node.chats.map(toChatInfo),
  };
}

function toChatTreeSnapshot(snapshot: ChatTreeSnapshotRecord): ChatTreeSnapshot {
  return {
    workspaceId: snapshot.workspaceId,
    rootFolders: snapshot.rootFolders.map(toChatTreeFolderNode),
    rootChats: snapshot.rootChats.map(toChatInfo),
  };
}

function toChatTreeFolderListItem(folder: ChatTreeFolderListItemRecord): ChatTreeFolderListItem {
  return {
    ...toFolderInfo(folder),
    childFolderCount: folder.childFolderCount,
    childChatCount: folder.childChatCount,
  };
}

function toChatTreeChildrenSlice(slice: ChatTreeChildrenSliceRecord): ChatTreeChildrenSlice {
  return {
    workspaceId: slice.workspaceId,
    parentFolderId: slice.parentFolderId,
    folders: slice.folders.map(toChatTreeFolderListItem),
    chats: slice.chats.map(toChatInfo),
  };
}

function toDeleteChatTreeItemsResult(
  result: DeleteChatTreeItemsResultRecord,
): DeleteChatTreeItemsResult {
  return {
    workspaceId: result.workspaceId,
    deletedChatIds: result.deletedChatIds,
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

function normalizeLayout(value: unknown, depth = 0): ChatLayoutNode | null {
  if (depth > 20 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = normalizeTabId(record.id);
  if (!id) return null;
  if (record.type === "pane") {
    const chatId = parseChatId(record.chatId);
    if (!chatId.ok) return null;
    const allowedViews = ["/chat", "/chat/graph", "/chat/pinned-branches", "/chat/settings"];
    const view = allowedViews.includes(record.view as string) ? record.view : "/chat";
    return {
      id,
      type: "pane",
      chatId: chatId.value,
      view: view as ChatPaneState["view"],
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
    .filter((child): child is ChatLayoutNode => child !== null);
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

function getLayoutPanes(node: ChatLayoutNode): ChatPaneState[] {
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

    if (record.type !== "chat") continue;
    const layout = normalizeLayout(record.layout);
    if (!layout) continue;
    const panes = getLayoutPanes(layout);
    const focusedPaneId =
      typeof record.focusedPaneId === "string" &&
      panes.some((pane) => pane.id === record.focusedPaneId)
        ? record.focusedPaneId
        : panes[0].id;

    seenTabIds.add(tabId);
    normalizedTabs.push({ id: tabId, type: "chat", layout, focusedPaneId });

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

  const existingChatIds = new Set(
    listWorkspaceChatIds(
      workspaceId,
      tabs.flatMap((tab) => getLayoutPanes(tab.layout).map((p) => p.chatId)),
    ),
  );
  return tabs.flatMap((tab) => {
    const layout = pruneLayout(tab.layout, existingChatIds);
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

function pruneLayout(node: ChatLayoutNode, chatIds: ReadonlySet<string>): ChatLayoutNode | null {
  if (node.type === "pane") return chatIds.has(node.chatId) ? node : null;
  const children = node.children
    .map((child) => pruneLayout(child, chatIds))
    .filter((child): child is ChatLayoutNode => child !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children, sizes: children.map(() => 100 / children.length) };
}

export function createChatTreeService(): ChatTreeService {
  function applyDeletionUiCleanup(result: DeleteChatTreeItemsResultRecord): void {
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
    const deletedChatIds = new Set(result.deletedChatIds);
    const nextTabs = currentTabs.flatMap((tab) => {
      const layout = pruneLayout(
        tab.layout,
        new Set(
          getLayoutPanes(tab.layout)
            .map((pane) => pane.chatId)
            .filter((id) => !deletedChatIds.has(id)),
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
        deletedChatIds: [deletedChat.id],
        deletedFolderIds: [],
      });
    },
  };
}
