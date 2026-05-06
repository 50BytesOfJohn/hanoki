import type { ProviderId } from "../providers/catalog";
import type { HanokiUiMessage } from "../chat/message-metadata";
import type { PinnedBranchSummary } from "../chat/pinned-branch";

export const IPC_CHANNELS = {
  workspaces: {
    list: "workspaces:list",
    getActive: "workspaces:getActive",
    create: "workspaces:create",
    setActive: "workspaces:setActive",
    update: "workspaces:update",
    updateSettings: "workspaces:updateSettings",
    getTabsUiState: "workspaces:getTabsUiState",
    setTabsUiState: "workspaces:setTabsUiState",
  },
  settings: {
    getGlobalChat: "settings:getGlobalChat",
    updateGlobalChat: "settings:updateGlobalChat",
  },
  contextMenu: {
    showText: "contextMenu:showText",
    showMessage: "contextMenu:showMessage",
  },
  chatTree: {
    get: "chatTree:get",
    getChildren: "chatTree:getChildren",
    getUiState: "chatTree:getUiState",
    setUiState: "chatTree:setUiState",
    deleteItems: "chatTree:deleteItems",
    showContextMenu: "chatTree:showContextMenu",
  },
  folders: {
    create: "folders:create",
    updateName: "folders:updateName",
    move: "folders:move",
    delete: "folders:delete",
  },
  chats: {
    get: "chats:get",
    create: "chats:create",
    clone: "chats:clone",
    updateTitle: "chats:updateTitle",
    updateSettings: "chats:updateSettings",
    move: "chats:move",
    delete: "chats:delete",
  },
  messages: {
    listByChat: "messages:listByChat",
    listAllByChat: "messages:listAllByChat",
    switchBranch: "messages:switchBranch",
    edit: "messages:edit",
    setPinned: "messages:setPinned",
    listPinned: "messages:listPinned",
  },
  providers: {
    list: "providers:list",
    listModels: "providers:listModels",
    testCredentials: "providers:testCredentials",
    save: "providers:save",
    updateSecrets: "providers:updateSecrets",
    delete: "providers:delete",
  },
  models: {
    listEnabled: "models:listEnabled",
    update: "models:update",
    setProviderEnabled: "models:setProviderEnabled",
  },
} as const;

export interface WorkspaceInfo {
  id: string;
  name: string;
  color?: string;
}

export interface ActiveWorkspaceInfo extends WorkspaceInfo {
  settings?: WorkspaceSettings;
}

export interface GetActiveWorkspaceOptions {
  includeSettings?: boolean;
}

export interface WorkspaceUpdateInput {
  name?: string;
  color?: string | null;
}

export type ChatFormSubmitBehavior = "enter" | "mod-enter";

export interface GlobalChatSettings {
  promptStickyPosition: boolean;
  formSubmitBehavior: ChatFormSubmitBehavior;
}

export interface GlobalChatSettingsUpdateInput {
  promptStickyPosition?: boolean;
  formSubmitBehavior?: ChatFormSubmitBehavior;
}

export interface TextContextMenuInput {
  isEditable: boolean;
  hasSelection: boolean;
  selectionText: string;
}

export type MessageContextMenuAction = "show-in-graph" | null;

export interface FolderInfo {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatInfo {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  settings: ChatSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSettings {
  modelId?: string | null;
  systemPrompt?: string | null;
}

export interface ChatSettingsUpdateInput {
  modelId?: string | null;
  systemPrompt?: string | null;
}

export interface ChatTreeFolderNode extends FolderInfo {
  folders: ChatTreeFolderNode[];
  chats: ChatInfo[];
}

export interface ChatTreeSnapshot {
  workspaceId: string;
  rootFolders: ChatTreeFolderNode[];
  rootChats: ChatInfo[];
}

export interface ChatTreeFolderListItem extends FolderInfo {
  childFolderCount: number;
  childChatCount: number;
}

export interface ChatTreeChildrenSlice {
  workspaceId: string;
  parentFolderId: string | null;
  folders: ChatTreeFolderListItem[];
  chats: ChatInfo[];
}

export interface ChatTreeUiState {
  expandedFolderIds: string[];
}

export interface ChatTreeItemRef {
  kind: "chat" | "folder";
  id: string;
}

export interface DeleteChatTreeItemsResult {
  workspaceId: string;
  deletedChatIds: string[];
  deletedFolderIds: string[];
}

export type TabType = "chat";

export interface TabStateItem {
  id: string;
  type: TabType;
  chatId: string;
}

export interface TabsUiState {
  tabs: TabStateItem[];
  activeTabId: string | null;
}

export interface WorkspaceSettings {
  chatTreeExpandedFolderIds?: string[];
  tabs?: TabStateItem[];
  activeTabId?: string | null;
}

export type WorkspaceSettingsPatch = Partial<WorkspaceSettings>;

export interface ProviderCredentialTestInput {
  providerId: ProviderId;
  config: Record<string, unknown>;
}

export interface ProviderCredentialTestResult {
  providerId: ProviderId;
  ok: boolean;
  message: string;
}

export interface ProviderInfo {
  id: string;
  displayName: string;
  catalogId: ProviderId;
}

export type ProviderModelStatus = "active" | "deprecated" | "removed";

export interface ProviderModelInfo {
  id: string;
  providerId: string;
  providerModelId: string;
  displayName: string | null;
  isEnabled: boolean;
  status: ProviderModelStatus;
}

export interface SaveProviderInput {
  catalogId: ProviderId;
  displayName?: string;
  config: Record<string, unknown>;
}

export interface SaveProviderResult {
  id: string;
  displayName: string;
  catalogId: ProviderId;
}

export interface UpdateProviderSecretsInput {
  providerId: string;
  config: Record<string, unknown>;
}

export interface UpdateModelInput {
  isEnabled?: boolean;
  displayName?: string | null;
}

export interface UpdateModelResult {
  id: string;
  providerId: string;
  providerModelId: string;
  displayName: string | null;
  isEnabled: boolean;
  status: ProviderModelStatus;
}

export interface SetProviderModelsEnabledResult {
  providerId: string;
  isEnabled: boolean;
  matchedCount: number;
  updatedCount: number;
}

export type EditMessageBehavior = "branch" | "overwrite";

export interface IpcApi {
  onSystemEvent: (callback: (event: import("../events").SystemEvent) => void) => () => void;
  getSystemState: () => Promise<import("../events").SystemState>;
  listWorkspaces: () => Promise<WorkspaceInfo[]>;
  getActiveWorkspace: (options?: GetActiveWorkspaceOptions) => Promise<ActiveWorkspaceInfo>;
  createWorkspace: (name: string) => Promise<WorkspaceInfo>;
  setActiveWorkspace: (id: string) => Promise<ActiveWorkspaceInfo>;
  updateWorkspace: (id: string, input: WorkspaceUpdateInput) => Promise<WorkspaceInfo>;
  updateWorkspaceSettings: (
    id: string,
    settingsPatch: WorkspaceSettingsPatch,
  ) => Promise<WorkspaceSettings>;
  getGlobalChatSettings: () => Promise<GlobalChatSettings>;
  updateGlobalChatSettings: (input: GlobalChatSettingsUpdateInput) => Promise<GlobalChatSettings>;
  showTextContextMenu: (input: TextContextMenuInput) => Promise<void>;
  showMessageContextMenu: (input: TextContextMenuInput) => Promise<MessageContextMenuAction>;
  getChatTree: (workspaceId: string) => Promise<ChatTreeSnapshot>;
  getChatTreeChildren: (
    workspaceId: string,
    parentFolderId?: string | null,
  ) => Promise<ChatTreeChildrenSlice>;
  getChatTreeUiState: (workspaceId: string) => Promise<ChatTreeUiState>;
  setChatTreeUiState: (
    workspaceId: string,
    expandedFolderIds: string[],
  ) => Promise<ChatTreeUiState>;
  deleteChatTreeItems: (
    workspaceId: string,
    items: ChatTreeItemRef[],
  ) => Promise<DeleteChatTreeItemsResult>;
  getWorkspaceTabsUiState: (workspaceId: string) => Promise<TabsUiState>;
  setWorkspaceTabsUiState: (workspaceId: string, tabs: TabStateItem[]) => Promise<TabsUiState>;
  getChat: (id: string) => Promise<ChatInfo>;
  listChatMessages: (chatId: string, branchId?: string | null) => Promise<HanokiUiMessage[]>;
  listAllChatMessages: (chatId: string) => Promise<HanokiUiMessage[]>;
  switchChatBranch: (chatId: string, branchId: string) => Promise<HanokiUiMessage[]>;
  editMessage: (
    messageId: string,
    text: string,
    behavior: EditMessageBehavior,
  ) => Promise<HanokiUiMessage[]>;
  setMessagePinned: (messageId: string, pinned: boolean) => Promise<void>;
  listPinnedBranches: () => Promise<PinnedBranchSummary[]>;
  createFolder: (
    workspaceId: string,
    name: string,
    parentId?: string | null,
  ) => Promise<FolderInfo>;
  updateFolderName: (id: string, name: string) => Promise<FolderInfo>;
  moveFolder: (id: string, parentId: string | null) => Promise<FolderInfo>;
  deleteFolder: (id: string) => Promise<void>;
  createChat: (workspaceId: string, title: string, folderId?: string | null) => Promise<ChatInfo>;
  cloneChat: (chatId: string) => Promise<ChatInfo>;
  updateChatTitle: (id: string, title: string) => Promise<ChatInfo>;
  updateChatSettings: (id: string, input: ChatSettingsUpdateInput) => Promise<ChatInfo>;
  moveChat: (id: string, folderId: string | null) => Promise<ChatInfo>;
  deleteChat: (id: string) => Promise<void>;
  showChatTreeItemContextMenu: (
    itemId: string,
    itemKind: "folder" | "chat",
  ) => Promise<
    "add-folder" | "add-chat" | "open-in-new-tab" | "clone" | "rename" | "delete" | null
  >;
  listProviders: () => Promise<ProviderInfo[]>;
  listProviderModels: (providerId: string) => Promise<ProviderModelInfo[]>;
  testProviderCredentials: (
    input: ProviderCredentialTestInput,
  ) => Promise<ProviderCredentialTestResult>;
  saveProvider: (input: SaveProviderInput) => Promise<SaveProviderResult>;
  updateProviderSecrets: (input: UpdateProviderSecretsInput) => Promise<ProviderInfo>;
  deleteProvider: (providerId: string) => Promise<void>;
  listEnabledModels: () => Promise<ProviderModelInfo[]>;
  updateModel: (modelId: string, input: UpdateModelInput) => Promise<UpdateModelResult>;
  setProviderModelsEnabled: (
    providerId: string,
    isEnabled: boolean,
  ) => Promise<SetProviderModelsEnabledResult>;
}
