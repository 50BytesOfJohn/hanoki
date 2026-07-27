import type { ProviderId } from "../providers/catalog";
import type { HanokiUiMessage } from "../chat/message-metadata";
import type { PinnedBranchSummary } from "../chat/pinned-branch";
import type { TiptapDocument } from "../tiptap/document";

export const IPC_CHANNELS = {
  workspaces: {
    list: "workspaces:list",
    getActive: "workspaces:getActive",
    create: "workspaces:create",
    setActive: "workspaces:setActive",
    update: "workspaces:update",
    getSettings: "workspaces:getSettings",
    updateSettings: "workspaces:updateSettings",
    getTabsUiState: "workspaces:getTabsUiState",
    setTabsUiState: "workspaces:setTabsUiState",
  },
  settings: {
    getGlobalChat: "settings:getGlobalChat",
    updateGlobalChat: "settings:updateGlobalChat",
    getSumi: "settings:getSumi",
    updateSumi: "settings:updateSumi",
  },
  contextMenu: {
    execute: "contextMenu:execute",
  },
  chatTree: {
    get: "chatTree:get",
    getChildren: "chatTree:getChildren",
    getUiState: "chatTree:getUiState",
    setUiState: "chatTree:setUiState",
    deleteItems: "chatTree:deleteItems",
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
    delete: "messages:delete",
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

export type ChatSidebarViewMode = "tree" | "activity";

export type ChatTabsPosition = "top" | "sidebar";

/** Sort order of the sidebar folder tree. Per workspace; the activity view is always recency-sorted. */
export type ChatTreeSortOrder =
  | "name-asc"
  | "name-desc"
  | "updated-desc"
  | "updated-asc"
  | "created-desc"
  | "created-asc";

export type ChatTreeFolderPlacement = "first" | "last" | "mixed";

export interface GlobalChatSettings {
  promptStickyPosition: boolean;
  formSubmitBehavior: ChatFormSubmitBehavior;
  sidebarViewMode: ChatSidebarViewMode;
  tabsPosition: ChatTabsPosition;
}

export interface GlobalChatSettingsUpdateInput {
  promptStickyPosition?: boolean;
  formSubmitBehavior?: ChatFormSubmitBehavior;
  sidebarViewMode?: ChatSidebarViewMode;
  tabsPosition?: ChatTabsPosition;
}

export interface SumiModelReference {
  providerId: string;
  providerModelId: string;
}

export interface SumiPromptActionsSettings {
  enabled: boolean;
  model: SumiModelReference | null;
}

export interface SumiTitleGenerationSettings {
  enabled: boolean;
  autoGenerate: boolean;
  model: SumiModelReference | null;
}

export interface SumiSettings {
  promptActions: SumiPromptActionsSettings;
  titleGeneration: SumiTitleGenerationSettings;
}

export interface SumiPromptActionsSettingsUpdateInput {
  enabled?: boolean;
  model?: SumiModelReference;
}

export interface SumiTitleGenerationSettingsUpdateInput {
  enabled?: boolean;
  autoGenerate?: boolean;
  model?: SumiModelReference;
}

export interface SumiSettingsUpdateInput {
  promptActions?: SumiPromptActionsSettingsUpdateInput;
  titleGeneration?: SumiTitleGenerationSettingsUpdateInput;
}

export type ContextMenuCommand =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "paste-and-match-style"
  | "delete"
  | "select-all"
  | "look-up"
  | "search-web";

export interface ContextMenuCommandInput {
  command: ContextMenuCommand;
  selectionText?: string;
}

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
  modelConfig?: ChatModelConfig;
  webEnabled?: boolean;
  hanokiEnabled?: boolean;
}

export interface ChatModelConfig {
  temperature?: number;
}

export interface ChatSettingsUpdateInput {
  modelId?: string | null;
  systemPrompt?: string | null;
  modelConfig?: {
    temperature?: number | null;
  };
  webEnabled?: boolean;
  hanokiEnabled?: boolean;
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

export type ChatPaneView = "/chat" | "/chat/graph" | "/chat/pinned-branches" | "/chat/settings";

export interface ChatPaneState {
  id: string;
  type: "pane";
  chatId: string;
  view: ChatPaneView;
  graphMessageId?: string;
}

export interface ChatSplitState {
  id: string;
  type: "split";
  orientation: "horizontal" | "vertical";
  children: ChatLayoutNode[];
  sizes: number[];
}

export type ChatLayoutNode = ChatPaneState | ChatSplitState;

export interface TabStateItem {
  id: string;
  type: TabType;
  layout: ChatLayoutNode;
  focusedPaneId: string;
}

export interface TabsUiState {
  tabs: TabStateItem[];
  activeTabId: string | null;
}

export interface WorkspaceSettings {
  chatTreeExpandedFolderIds?: string[];
  tabs?: TabStateItem[];
  activeTabId?: string | null;
  sidebarViewMode?: ChatSidebarViewMode;
  chatTreeSortOrder?: ChatTreeSortOrder;
  chatTreeFolderPlacement?: ChatTreeFolderPlacement;
  /** Unsent composer documents per chat id. Strings are legacy drafts. */
  chatDrafts?: Record<string, TiptapDocument | string>;
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

/** "message": the message and its descendants. "branch": all siblings (same parentId) and their descendants. */
export type DeleteMessageScope = "message" | "branch";

export interface IpcApi {
  onSystemEvent: (callback: (event: import("../events").SystemEvent) => void) => () => void;
  getSystemState: () => Promise<import("../events").SystemState>;
  listWorkspaces: () => Promise<WorkspaceInfo[]>;
  getActiveWorkspace: (options?: GetActiveWorkspaceOptions) => Promise<ActiveWorkspaceInfo>;
  createWorkspace: (name: string) => Promise<WorkspaceInfo>;
  setActiveWorkspace: (id: string) => Promise<ActiveWorkspaceInfo>;
  updateWorkspace: (id: string, input: WorkspaceUpdateInput) => Promise<WorkspaceInfo>;
  getWorkspaceSettings: (id: string) => Promise<WorkspaceSettings>;
  updateWorkspaceSettings: (
    id: string,
    settingsPatch: WorkspaceSettingsPatch,
  ) => Promise<WorkspaceSettings>;
  getGlobalChatSettings: () => Promise<GlobalChatSettings>;
  updateGlobalChatSettings: (input: GlobalChatSettingsUpdateInput) => Promise<GlobalChatSettings>;
  getSumiSettings: () => Promise<SumiSettings>;
  updateSumiSettings: (input: SumiSettingsUpdateInput) => Promise<SumiSettings>;
  executeContextMenuCommand: (input: ContextMenuCommandInput) => Promise<void>;
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
    content: TiptapDocument | string,
    behavior: EditMessageBehavior,
  ) => Promise<HanokiUiMessage[]>;
  deleteMessage: (messageId: string, scope: DeleteMessageScope) => Promise<HanokiUiMessage[]>;
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
