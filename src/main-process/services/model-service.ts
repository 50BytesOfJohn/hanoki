import type {
  ProviderModelInfo,
  RecentModelUsage,
  SetProviderModelsEnabledResult,
  UpdateModelInput,
  UpdateModelResult,
} from "@shared/ipc";
import type { ProviderId } from "@shared/providers/catalog";
import { getModelDetails } from "@shared/models/model-details";
import {
  getModelReasoningEfforts,
  isReasoningEffort,
  type ReasoningEffort,
} from "@shared/models/reasoning";
import { getModelTemperatureMax } from "@shared/models/temperature";
import { listProviders } from "../providers/repository";
import {
  deleteModelUsage,
  listActiveModels,
  listModelUsage,
  recordModelUsage,
  updateModel as updateModelRepo,
  updateModelsByProviderId,
  type ModelTableRow,
} from "../models/repository";
import { AppError } from "../ipc/core/errors";

/** Stored in `models.reasoning_effort` for an explicit provider default. */
const REMEMBERED_DEFAULT_EFFORT = "default";
/** The picker shows a handful; a few spare cover disabled or removed models. */
const RECENT_MODELS_LIMIT = 12;

export interface ModelService {
  listModels(): ProviderModelInfo[];
  listRecentModels(): RecentModelUsage[];
  recordModelUsage(modelId: string, reasoningEffort: ReasoningEffort | null): void;
  removeRecentModel(modelId: string, reasoningEffort: ReasoningEffort | null): void;
  updateModel(modelId: string, input: UpdateModelInput): UpdateModelResult;
  setProviderModelsEnabled(providerId: string, isEnabled: boolean): SetProviderModelsEnabledResult;
}

export function createModelService(): ModelService {
  return {
    listModels() {
      const catalogIdByProviderId = new Map(
        listProviders().map((provider) => [provider.id, provider.catalogId as ProviderId]),
      );

      return listActiveModels().map((row) => {
        const catalogId = catalogIdByProviderId.get(row.providerId);
        const details = getModelDetails(row.metadata, row.providerModelId, catalogId);

        return {
          ...toModelResult(row),
          // The picker needs these and metadata stays out of the list, so they
          // are resolved here instead of shipping the raw catalog.
          reasoningEfforts: catalogId ? getModelReasoningEfforts(catalogId, row.metadata) : [],
          temperatureMax: catalogId ? getModelTemperatureMax(catalogId, row.metadata) : null,
          contextLength: details.contextLength,
          creator: details.creator,
        };
      });
    },

    listRecentModels() {
      return listModelUsage(RECENT_MODELS_LIMIT).map((row) => ({
        modelId: row.modelId,
        reasoningEffort: isReasoningEffort(row.reasoningEffort) ? row.reasoningEffort : null,
        usedAt: row.usedAt,
      }));
    },

    recordModelUsage(modelId, reasoningEffort) {
      recordModelUsage(modelId, reasoningEffort ?? "");
    },

    removeRecentModel(modelId, reasoningEffort) {
      deleteModelUsage(modelId, reasoningEffort ?? "");
    },

    updateModel(modelId, input) {
      const updated = updateModelRepo(modelId, {
        isEnabled: input.isEnabled,
        displayName: input.displayName,
        pinnedAt: input.isPinned === undefined ? undefined : input.isPinned ? Date.now() : null,
        reasoningEffort:
          input.rememberedEffort === undefined
            ? undefined
            : (input.rememberedEffort ?? REMEMBERED_DEFAULT_EFFORT),
      });
      if (!updated) {
        throw AppError.notFound(`Model "${modelId}" not found.`);
      }

      return toModelResult(updated);
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

function toModelResult(row: ModelTableRow): UpdateModelResult {
  const rememberedEffort = parseRememberedEffort(row.reasoningEffort);

  return {
    id: row.id,
    providerId: row.providerId,
    providerModelId: row.providerModelId,
    displayName: row.displayName,
    isEnabled: row.isEnabled,
    status: row.lifecycleStatus as ProviderModelInfo["status"],
    pinnedAt: row.pinnedAt,
    ...(rememberedEffort === undefined ? {} : { rememberedEffort }),
  };
}

function parseRememberedEffort(value: string | null): ReasoningEffort | null | undefined {
  if (value === REMEMBERED_DEFAULT_EFFORT) {
    return null;
  }

  return isReasoningEffort(value) ? value : undefined;
}
