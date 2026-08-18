export const queryKeys = {
  workspaces: {
    all: ["workspaces"] as const,
    list: () => [...queryKeys.workspaces.all, "list"] as const,
    active: () => [...queryKeys.workspaces.all, "active"] as const,
    detail: (id: string) => [...queryKeys.workspaces.all, "detail", id] as const,
    settings: (id: string) => [...queryKeys.workspaces.all, "settings", id] as const,
  },
  settings: {
    all: ["settings"] as const,
    globalChat: () => [...queryKeys.settings.all, "globalChat"] as const,
    sumi: () => [...queryKeys.settings.all, "sumi"] as const,
    tools: () => [...queryKeys.settings.all, "tools"] as const,
  },
  chatTree: {
    all: ["chatTree"] as const,
    uiState: (workspaceId: string) => [...queryKeys.chatTree.all, "uiState", workspaceId] as const,
    snapshot: (workspaceId: string) =>
      [...queryKeys.chatTree.all, "snapshot", workspaceId] as const,
  },
  chats: {
    all: ["chats"] as const,
    byId: (chatId: string) => [...queryKeys.chats.all, "byId", chatId] as const,
    allMessages: (chatId: string) => [...queryKeys.chats.all, "allMessages", chatId] as const,
    messages: (chatId: string, branchId: string) =>
      [...queryKeys.chats.all, "messages", chatId, branchId] as const,
    detail: (workspaceId: string, chatId: string) =>
      [...queryKeys.chats.all, "detail", workspaceId, chatId] as const,
    pinnedBranches: () => [...queryKeys.chats.all, "pinned-branches"] as const,
  },
  items: {
    all: ["items"] as const,
    byId: (itemId: string) => [...queryKeys.items.all, "byId", itemId] as const,
  },
  folders: {
    all: ["folders"] as const,
    detail: (workspaceId: string, folderId: string) =>
      [...queryKeys.folders.all, "detail", workspaceId, folderId] as const,
  },
  providers: {
    all: ["providers"] as const,
    list: () => [...queryKeys.providers.all, "list"] as const,
    models: (providerId: string) => [...queryKeys.providers.all, "models", providerId] as const,
    detail: (id: string) => [...queryKeys.providers.all, "detail", id] as const,
  },
  models: {
    all: ["models"] as const,
    enabled: () => [...queryKeys.models.all, "enabled"] as const,
  },
} as const;
