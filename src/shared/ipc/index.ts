import type { ProviderId } from "../providers/catalog";
import type { HanokiUiMessage } from "../chat/message-metadata";
import type { ChatExportFormat, ChatExportResult } from "../chat/chat-export";
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
    getTools: "settings:getTools",
    updateTerminalTool: "settings:updateTerminalTool",
    pickTerminalWorkingDirectory: "settings:pickTerminalWorkingDirectory",
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
  items: {
    get: "items:get",
    updateTitle: "items:updateTitle",
    move: "items:move",
    delete: "items:delete",
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
    export: "chats:export",
    updateTitle: "chats:updateTitle",
    updateSettings: "chats:updateSettings",
    move: "chats:move",
    delete: "chats:delete",
  },
  terminals: {
    create: "terminals:create",
    start: "terminals:start",
    write: "terminals:write",
    resize: "terminals:resize",
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
  updates: {
    check: "updates:check",
    install: "updates:install",
    openReleases: "updates:openReleases",
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
  activityPanelEnabled: boolean;
}

export interface GlobalChatSettingsUpdateInput {
  promptStickyPosition?: boolean;
  formSubmitBehavior?: ChatFormSubmitBehavior;
  sidebarViewMode?: ChatSidebarViewMode;
  tabsPosition?: ChatTabsPosition;
  activityPanelEnabled?: boolean;
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

/**
 * - `ask`: every call waits for approval in the chat.
 * - `always`: calls run without asking.
 *
 * There is no off switch: a chat only gets the tool when it opts in via the
 * tools menu or an @Terminal mention, so that is already the on/off control.
 */
export type TerminalToolMode = "ask" | "always";

export const TERMINAL_TOOL_MODES: readonly TerminalToolMode[] = ["ask", "always"];

export interface TerminalToolSettings {
  mode: TerminalToolMode;
  /** Directory new chats start in. Absolute path; defaults to the home folder. */
  workingDirectory: string;
  /** The login shell commands will run in, for display in settings. */
  shell: string;
}

export interface TerminalToolSettingsUpdateInput {
  mode?: TerminalToolMode;
  workingDirectory?: string;
}

export interface ToolSettings {
  terminal: TerminalToolSettings;
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
  type: "chat";
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  data: ChatItemData;
  metadata: Record<string, unknown>;
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ChatItemData extends Record<string, unknown> {
  settings: ChatSettings;
  currentBranchId?: string;
}

export interface TerminalItemData extends Record<string, unknown> {
  workingDirectory: string;
  shell: string;
  columns: number;
  rows: number;
  scrollback: string;
  scrollbackVersion: number;
}

export const TERMINAL_SCROLLBACK_VERSION = 2;

export interface TerminalInfo {
  type: "terminal";
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  data: TerminalItemData;
  metadata: Record<string, unknown>;
  extensions: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type ItemType = ChatInfo["type"] | TerminalInfo["type"];
export type ItemInfo = ChatInfo | TerminalInfo;

export interface TerminalSessionSnapshot {
  itemId: string;
  sequence: number;
  scrollback: string;
  status: "running" | "exited";
  exitCode: number | null;
}

export type TerminalEvent =
  | { type: "data"; itemId: string; sequence: number; data: string }
  | { type: "exit"; itemId: string; sequence: number; exitCode: number | null };

export const TERMINAL_EVENT_CHANNEL = "terminals:event";

export interface ChatSettings {
  modelId?: string | null;
  systemPrompt?: string | null;
  modelConfig?: ChatModelConfig;
  webEnabled?: boolean;
  hanokiEnabled?: boolean;
  terminalEnabled?: boolean;
  /** Set by "Allow for this chat" on an approval card; skips further prompts. */
  terminalAutoApprove?: boolean;
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
  terminalEnabled?: boolean;
  terminalAutoApprove?: boolean;
}

export interface ChatTreeFolderNode extends FolderInfo {
  folders: ChatTreeFolderNode[];
  items: ItemInfo[];
}

export interface ChatTreeSnapshot {
  workspaceId: string;
  rootFolders: ChatTreeFolderNode[];
  rootItems: ItemInfo[];
}

export interface ChatTreeFolderListItem extends FolderInfo {
  childFolderCount: number;
  childItemCount: number;
}

export interface ChatTreeChildrenSlice {
  workspaceId: string;
  parentFolderId: string | null;
  folders: ChatTreeFolderListItem[];
  items: ItemInfo[];
}

export interface ChatTreeUiState {
  expandedFolderIds: string[];
}

export interface ChatTreeItemRef {
  kind: "item" | "folder";
  id: string;
}

export interface DeleteChatTreeItemsResult {
  workspaceId: string;
  deletedItemIds: string[];
  deletedFolderIds: string[];
}

export type TabType = "item";

export type ChatPaneView = "/chat" | "/chat/graph" | "/chat/pinned-branches" | "/chat/settings";

export interface ChatItemPaneState {
  id: string;
  type: "pane";
  itemId: string;
  itemType: "chat";
  view: ChatPaneView;
  graphMessageId?: string;
}

export interface TerminalItemPaneState {
  id: string;
  type: "pane";
  itemId: string;
  itemType: "terminal";
  view: "/terminal";
}

export type ItemPaneState = ChatItemPaneState | TerminalItemPaneState;

export interface ItemSplitState {
  id: string;
  type: "split";
  orientation: "horizontal" | "vertical";
  children: ItemLayoutNode[];
  sizes: number[];
}

export type ItemLayoutNode = ItemPaneState | ItemSplitState;

export interface TabStateItem {
  id: string;
  type: TabType;
  layout: ItemLayoutNode;
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
  onTerminalEvent: (callback: (event: TerminalEvent) => void) => () => void;
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
  getToolSettings: () => Promise<ToolSettings>;
  updateTerminalToolSettings: (
    input: TerminalToolSettingsUpdateInput,
  ) => Promise<TerminalToolSettings>;
  /** Opens a native folder picker. Resolves to null when the user cancels. */
  pickTerminalWorkingDirectory: () => Promise<string | null>;
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
  getItem: (id: string) => Promise<ItemInfo>;
  updateItemTitle: (id: string, title: string) => Promise<ItemInfo>;
  moveItem: (id: string, folderId: string | null) => Promise<ItemInfo>;
  deleteItem: (id: string) => Promise<void>;
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
  exportChat: (chatId: string, format: ChatExportFormat) => Promise<ChatExportResult>;
  updateChatTitle: (id: string, title: string) => Promise<ChatInfo>;
  updateChatSettings: (id: string, input: ChatSettingsUpdateInput) => Promise<ChatInfo>;
  moveChat: (id: string, folderId: string | null) => Promise<ChatInfo>;
  deleteChat: (id: string) => Promise<void>;
  createTerminal: (
    workspaceId: string,
    title: string,
    folderId?: string | null,
  ) => Promise<TerminalInfo>;
  startTerminal: (id: string) => Promise<TerminalSessionSnapshot>;
  writeTerminal: (id: string, data: string) => Promise<void>;
  resizeTerminal: (id: string, columns: number, rows: number) => Promise<void>;
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
  checkForUpdates: () => Promise<import("../events").UpdateStateSnapshot>;
  installUpdate: () => Promise<void>;
  openReleasesPage: () => Promise<void>;
}
