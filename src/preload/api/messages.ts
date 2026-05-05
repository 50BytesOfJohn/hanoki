import { IPC_CHANNELS, type EditMessageBehavior, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type MessagesApi = Pick<
  IpcApi,
  | "listChatMessages"
  | "listAllChatMessages"
  | "switchChatBranch"
  | "editMessage"
  | "setMessagePinned"
  | "listPinnedBranches"
>;

export function createMessagesApi(): MessagesApi {
  return {
    listChatMessages: (chatId, branchId) =>
      invokeIpc(IPC_CHANNELS.messages.listByChat, chatId, branchId),
    listAllChatMessages: (chatId) => invokeIpc(IPC_CHANNELS.messages.listAllByChat, chatId),
    switchChatBranch: (chatId, branchId) =>
      invokeIpc(IPC_CHANNELS.messages.switchBranch, chatId, branchId),
    editMessage: (messageId, text, behavior: EditMessageBehavior) =>
      invokeIpc(IPC_CHANNELS.messages.edit, messageId, text, behavior),
    setMessagePinned: (messageId, pinned) =>
      invokeIpc(IPC_CHANNELS.messages.setPinned, messageId, pinned),
    listPinnedBranches: () => invokeIpc(IPC_CHANNELS.messages.listPinned),
  };
}
