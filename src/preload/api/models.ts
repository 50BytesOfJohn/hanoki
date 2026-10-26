import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ModelsApi = Pick<
  IpcApi,
  | "listModels"
  | "listRecentModels"
  | "removeRecentModel"
  | "setProviderModelsEnabled"
  | "updateModel"
>;

export function createModelsApi(): ModelsApi {
  return {
    listModels: () => invokeIpc(IPC_CHANNELS.models.list),
    listRecentModels: () => invokeIpc(IPC_CHANNELS.models.listRecent),
    removeRecentModel: (modelId, reasoningEffort) =>
      invokeIpc(IPC_CHANNELS.models.removeRecent, modelId, reasoningEffort),
    updateModel: (modelId, input) => invokeIpc(IPC_CHANNELS.models.update, modelId, input),
    setProviderModelsEnabled: (providerId, isEnabled) =>
      invokeIpc(IPC_CHANNELS.models.setProviderEnabled, providerId, isEnabled),
  };
}
