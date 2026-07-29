import type { GlobalChatSettings } from "../ipc";

export const SYSTEM_EVENT_CHANNEL = "system:event" as const;
export const SYSTEM_STATE_CHANNEL = "system:getState" as const;

export type AiServerEvent =
  | { type: "ai-server:starting" }
  | { type: "ai-server:ready"; port: number }
  | { type: "ai-server:error"; error: string };

export type ProviderModelSyncStatus = "succeeded" | "failed";

export interface ProviderModelsSyncCompletedEvent {
  type: "providers:model-sync:completed";
  providerId: string;
  status: ProviderModelSyncStatus;
}

export interface ProvidersStartupModelSyncCompletedEvent {
  type: "providers:start-model-sync:completed";
  totalProviders: number;
  succeededProviders: number;
  failedProviders: number;
}

/** Emitted when global chat settings change outside the renderer, e.g. from the View menu. */
export interface GlobalChatSettingsUpdatedEvent {
  type: "settings:global-chat-updated";
  settings: GlobalChatSettings;
}

export interface ChatTitleUpdatedEvent {
  type: "chat:title-updated";
  chatId: string;
  workspaceId: string;
  title: string;
}

export type SystemEvent =
  | AiServerEvent
  | ProviderModelsSyncCompletedEvent
  | ProvidersStartupModelSyncCompletedEvent
  | GlobalChatSettingsUpdatedEvent
  | ChatTitleUpdatedEvent;

export interface AiServerStateSnapshot {
  status: "idle" | "starting" | "ready" | "error";
  port: number | null;
  error: string | null;
}

export interface SystemState {
  aiServer: AiServerStateSnapshot;
}
