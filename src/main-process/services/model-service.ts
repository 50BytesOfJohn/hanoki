import type {
  ProviderModelInfo,
  SetProviderModelsEnabledResult,
  UpdateModelInput,
  UpdateModelResult,
} from "@shared/ipc";
import type { ProviderId } from "@shared/providers/catalog";
import { getModelReasoningEfforts } from "@shared/models/reasoning";
import { listProviders } from "../providers/repository";
import {
  listEnabledModels as listEnabledModelsRepo,
  updateModel as updateModelRepo,
  updateModelsByProviderId,
} from "../models/repository";
import { AppError } from "../ipc/core/errors";

export interface ModelService {
  listEnabledModels(): ProviderModelInfo[];
  updateModel(modelId: string, input: UpdateModelInput): UpdateModelResult;
  setProviderModelsEnabled(providerId: string, isEnabled: boolean): SetProviderModelsEnabledResult;
}

export function createModelService(): ModelService {
  return {
    listEnabledModels() {
      const catalogIdByProviderId = new Map(
        listProviders().map((provider) => [provider.id, provider.catalogId as ProviderId]),
      );

      return listEnabledModelsRepo().map((row) => {
        const catalogId = catalogIdByProviderId.get(row.providerId);

        return {
          id: row.id,
          providerId: row.providerId,
          providerModelId: row.providerModelId,
          displayName: row.displayName,
          isEnabled: row.isEnabled,
          status: row.lifecycleStatus as ProviderModelInfo["status"],
          // The composer needs this and metadata stays out of the list, so the
          // efforts are resolved here instead of shipping the raw catalog.
          reasoningEfforts: catalogId ? getModelReasoningEfforts(catalogId, row.metadata) : [],
        };
      });
    },

    updateModel(modelId, input) {
      const updated = updateModelRepo(modelId, input);
      if (!updated) {
        throw AppError.notFound(`Model "${modelId}" not found.`);
      }

      return {
        id: updated.id,
        providerId: updated.providerId,
        providerModelId: updated.providerModelId,
        displayName: updated.displayName,
        isEnabled: updated.isEnabled,
        status: updated.lifecycleStatus as ProviderModelInfo["status"],
      };
    },

    setProviderModelsEnabled(providerId, isEnabled) {
      const result = updateModelsByProviderId(providerId, { isEnabled });

      return {
        providerId,
        isEnabled,
        matchedCount: result.matchedCount,
        updatedCount: result.updatedCount,
      };
    },
  };
}
