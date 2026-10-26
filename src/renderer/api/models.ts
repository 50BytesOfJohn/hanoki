import "../lib/electron-api";
import type { UpdateModelInput } from "@shared/ipc";
import type { ReasoningEffort } from "@shared/models/reasoning";

export const modelsApi = {
  list() {
    return window.electronAPI.listModels();
  },

  listRecent() {
    return window.electronAPI.listRecentModels();
  },

  removeRecent(modelId: string, reasoningEffort: ReasoningEffort | null) {
    return window.electronAPI.removeRecentModel(modelId, reasoningEffort);
  },

  update(modelId: string, input: UpdateModelInput) {
    return window.electronAPI.updateModel(modelId, input);
  },

  setProviderEnabled(providerId: string, isEnabled: boolean) {
    return window.electronAPI.setProviderModelsEnabled(providerId, isEnabled);
  },
};
