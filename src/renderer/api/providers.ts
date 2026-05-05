import "../lib/electron-api";
import type { ProviderCredentialTestInput, SaveProviderInput, UpdateModelInput } from "@shared/ipc";

export const providerApi = {
  list() {
    return window.electronAPI.listProviders();
  },
  listModels(providerId: string) {
    return window.electronAPI.listProviderModels(providerId);
  },
  testCredentials(input: ProviderCredentialTestInput) {
    return window.electronAPI.testProviderCredentials(input);
  },
  saveProvider(input: SaveProviderInput) {
    return window.electronAPI.saveProvider(input);
  },
  delete(providerId: string) {
    return window.electronAPI.deleteProvider(providerId);
  },
  updateModel(modelId: string, input: UpdateModelInput) {
    return window.electronAPI.updateModel(modelId, input);
  },
};
