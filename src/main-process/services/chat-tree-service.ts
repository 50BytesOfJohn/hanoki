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

    if (record.type !== "chat") {
      continue;
    }

    const parsedChatId = parseChatId(record.chatId);
    if (!parsedChatId.ok) {
      continue;
    }

    seenTabIds.add(tabId);
    normalizedTabs.push({ id: tabId, type: "chat", chatId: parsedChatId.value });

    if (normalizedTabs.length >= MAX_PERSISTED_TABS) {
      break;
    }
  }

  return normalizedTabs;
}

function normalizeActiveTabId(value: unknown, tabs: readonly TabStateItem[]): string | null {
  const normalizedId = normalizeTabId(value);
  if (!normalizedId) {
    return null;
  }

  return tabs.some((tab) => tab.id === normalizedId) ? normalizedId : null;
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
      tabs.map((tab) => tab.chatId),
    ),
  );
  return tabs.filter((tab) => existingChatIds.has(tab.chatId));
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

    const currentTabsUiState = readTabsUiState(result.workspaceId);
    const deletedChatIds = new Set(result.deletedChatIds);
    const nextTabs = currentTabsUiState.tabs.filter((tab) => !deletedChatIds.has(tab.chatId));

    if (nextTabs.length !== currentTabsUiState.tabs.length) {
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

    return {
      tabs: prunedTabs,
      activeTabId: normalizeActiveTabId(workspaceSettings[ACTIVE_TAB_ID_SETTINGS_KEY], prunedTabs),
    };
  }

  function writeTabsUiState(workspaceId: string, tabs: unknown): TabsUiState {
    const workspaceSettings = getWorkspaceSettings(workspaceId);
    const normalizedTabs = normalizeTabs(tabs);
    const prunedTabs = pruneTabsForWorkspace(workspaceId, normalizedTabs);
    const activeTabId = normalizeActiveTabId(
      workspaceSettings[ACTIVE_TAB_ID_SETTINGS_KEY],
      prunedTabs,
    );

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
