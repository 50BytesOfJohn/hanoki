import type { IpcHandlerContext } from "./core/context";
import { registerChatsIpcModule } from "./modules/chats";
import { registerChatTreeIpcModule } from "./modules/chat-tree";
import { registerContextMenuIpcModule } from "./modules/context-menu";
import { registerFoldersIpcModule } from "./modules/folders";
import { registerMessagesIpcModule } from "./modules/messages";
import { registerModelsIpcModule } from "./modules/models";
import { registerProvidersIpcModule } from "./modules/providers";
import { registerSettingsIpcModule } from "./modules/settings";
import { registerWorkspaceIpcModule } from "./modules/workspaces";

export function registerIpcHandlers(context: IpcHandlerContext): void {
  const registeredChannels = new Set<string>();
  registerWorkspaceIpcModule(context, registeredChannels);
  registerSettingsIpcModule(context, registeredChannels);
  registerContextMenuIpcModule(context, registeredChannels);
  registerChatTreeIpcModule(context, registeredChannels);
  registerFoldersIpcModule(context, registeredChannels);
  registerChatsIpcModule(context, registeredChannels);
  registerMessagesIpcModule(context, registeredChannels);
  registerModelsIpcModule(context, registeredChannels);
  registerProvidersIpcModule(context, registeredChannels);
}
