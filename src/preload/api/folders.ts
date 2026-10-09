import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type FoldersApi = Pick<
  IpcApi,
  | "createFolder"
  | "updateFolderName"
  | "moveFolder"
  | "deleteFolder"
  | "setFolderWordGoal"
  | "clearFolderWordGoal"
  | "getFolderWordGoal"
  | "getNearestWordGoal"
  | "listFolderWordGoalIds"
>;

export function createFoldersApi(): FoldersApi {
  return {
    createFolder: (workspaceId, name, parentId) =>
      invokeIpc(IPC_CHANNELS.folders.create, workspaceId, name, parentId),
    updateFolderName: (id, name) => invokeIpc(IPC_CHANNELS.folders.updateName, id, name),
    moveFolder: (id, parentId) => invokeIpc(IPC_CHANNELS.folders.move, id, parentId),
    deleteFolder: (id) => invokeIpc(IPC_CHANNELS.folders.delete, id),
    setFolderWordGoal: (id, targetWords) =>
      invokeIpc(IPC_CHANNELS.folders.setWordGoal, id, targetWords),
    clearFolderWordGoal: (id) => invokeIpc(IPC_CHANNELS.folders.clearWordGoal, id),
    getFolderWordGoal: (id) => invokeIpc(IPC_CHANNELS.folders.getWordGoal, id),
    getNearestWordGoal: (itemId) => invokeIpc(IPC_CHANNELS.folders.getNearestWordGoal, itemId),
    listFolderWordGoalIds: (workspaceId) =>
      invokeIpc(IPC_CHANNELS.folders.listWordGoalIds, workspaceId),
  };
}
