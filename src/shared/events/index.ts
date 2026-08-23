import type { GlobalChatSettings, ItemType } from "../ipc";

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

export interface ItemTitleUpdatedEvent {
  type: "item:title-updated";
  itemId: string;
  itemType: ItemType;
  workspaceId: string;
  title: string;
}

/**
 * Auto-update lifecycle, mirrored from Electron's `autoUpdater` in the main process.
 *
 * - `unsupported` — no updater on this build (dev, or a platform Squirrel does not cover).
 * - `idle` → `checking` → (`downloading` → `ready`) | back to `idle`.
 * - `error` is terminal until the next check; the app keeps running on the current version.
 */
export type UpdateStatus = "unsupported" | "idle" | "checking" | "downloading" | "ready" | "error";

export interface UpdateStateSnapshot {
  status: UpdateStatus;
  /** Version the app is running right now. Always present, including when unsupported. */
  currentVersion: string;
  /** Release name of the downloaded update, once `status` is `ready`. */
  readyVersion: string | null;
  /** Release notes of the downloaded update, when GitHub provided them. */
  releaseNotes: string | null;
  error: string | null;
  /** Set while a user-initiated check is in flight, so the UI can show a spinner. */
  checkedManually: boolean;
}

export interface UpdateStateChangedEvent {
  type: "update:state";
  update: UpdateStateSnapshot;
}

export type SystemEvent =
  | AiServerEvent
  | ProviderModelsSyncCompletedEvent
  | ProvidersStartupModelSyncCompletedEvent
  | GlobalChatSettingsUpdatedEvent
  | ItemTitleUpdatedEvent
  | UpdateStateChangedEvent;

export interface AiServerStateSnapshot {
  status: "idle" | "starting" | "ready" | "error";
  port: number | null;
  error: string | null;
}

export interface SystemState {
  aiServer: AiServerStateSnapshot;
  update: UpdateStateSnapshot;
}
