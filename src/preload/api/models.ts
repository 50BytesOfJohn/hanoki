import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ModelsApi = Pick<IpcApi, "listEnabledModels" | "setProviderModelsEnabled" | "updateModel">;

export function createModelsApi(): ModelsApi {
  return {
    listEnabledModels: () => invokeIpc(IPC_CHANNELS.models.listEnabled),
    updateModel: (modelId, input) => invokeIpc(IPC_CHANNELS.models.update, modelId, input),
    setProviderModelsEnabled: (providerId, isEnabled) =>
      invokeIpc(IPC_CHANNELS.models.setProviderEnabled, providerId, isEnabled),
  };
}
