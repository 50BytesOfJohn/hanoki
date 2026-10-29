import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";

type ProvidersApi = Pick<
  IpcApi,
  | "listProviders"
  | "listProviderModels"
  | "syncProviderModels"
  | "testProviderCredentials"
  | "saveProvider"
  | "updateProviderSecrets"
  | "deleteProvider"
>;

export function createProvidersApi(): ProvidersApi {
  return {
    listProviders: () => invokeIpc(IPC_CHANNELS.providers.list),
    listProviderModels: (providerId) => invokeIpc(IPC_CHANNELS.providers.listModels, providerId),
    syncProviderModels: (providerId) => invokeIpc(IPC_CHANNELS.providers.syncModels, providerId),
    testProviderCredentials: (input) => invokeIpc(IPC_CHANNELS.providers.testCredentials, input),
    saveProvider: (input) => invokeIpc(IPC_CHANNELS.providers.save, input),
    updateProviderSecrets: (input) => invokeIpc(IPC_CHANNELS.providers.updateSecrets, input),
    deleteProvider: (providerId) => invokeIpc(IPC_CHANNELS.providers.delete, providerId),
  };
}
