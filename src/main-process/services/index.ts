import { createChatMessagesService, type ChatMessagesService } from "./chat-messages-service";
import { createChatTreeService, type ChatTreeService } from "./chat-tree-service";
import { createModelService, type ModelService } from "./model-service";
import { createProviderService, type ProviderService } from "./provider-service";
import { createSettingsService, type SettingsService } from "./settings-service";
import { createWorkspaceService, type WorkspaceService } from "./workspace-service";
import type {
  ProviderModelSyncStatus,
  ProvidersStartupModelSyncCompletedEvent,
} from "@shared/events";

export interface AppServices {
  workspaces: WorkspaceService;
  settings: SettingsService;
  chatTree: ChatTreeService;
  chatMessages: ChatMessagesService;
  models: ModelService;
  providers: ProviderService;
}

interface AppServicesOptions {
  onProviderModelsSyncCompleted?: (payload: {
    providerId: string;
    status: ProviderModelSyncStatus;
  }) => void;
  onProvidersStartupModelSyncCompleted?: (
    payload: Omit<ProvidersStartupModelSyncCompletedEvent, "type">,
  ) => void;
}

export function createAppServices(options?: AppServicesOptions): AppServices {
  return {
    workspaces: createWorkspaceService(),
    settings: createSettingsService(),
    chatTree: createChatTreeService(),
    chatMessages: createChatMessagesService(),
    models: createModelService(),
    providers: createProviderService({
      onModelSyncCompleted: options?.onProviderModelsSyncCompleted,
      onStartupSyncCompleted: options?.onProvidersStartupModelSyncCompleted,
    }),
  };
}
