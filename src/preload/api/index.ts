import type { IpcApi } from "@shared/ipc";
import { createChatsApi } from "./chats";
import { createChatTreeApi } from "./chat-tree";
import { createContextMenuApi } from "./context-menu";
import { createEventsApi } from "../events";
import { createFoldersApi } from "./folders";
import { createMessagesApi } from "./messages";
import { createItemsApi } from "./items";
import { createModelsApi } from "./models";
import { createProvidersApi } from "./providers";
import { createSettingsApi } from "./settings";
import { createUpdatesApi } from "./updates";
import { createTerminalsApi } from "./terminals";
import { createWorkspaceApi } from "./workspaces";

export function createElectronApi(): IpcApi {
  return {
    ...createWorkspaceApi(),
    ...createSettingsApi(),
    ...createContextMenuApi(),
    ...createChatTreeApi(),
    ...createFoldersApi(),
    ...createItemsApi(),
    ...createChatsApi(),
    ...createMessagesApi(),
    ...createTerminalsApi(),
    ...createModelsApi(),
    ...createProvidersApi(),
    ...createUpdatesApi(),
    ...createEventsApi(),
  };
}
