import { generateText } from "ai";
import type { SumiModelReference } from "@shared/ipc";
import { getModelTemperatureMax } from "@shared/models/temperature";
import type { ProviderId } from "@shared/providers/catalog";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { createLanguageModel } from "../providers/language-model-factory";

export interface ResolvedSumiModel {
  providerId: string;
  providerModelId: string;
}

type SumiLanguageModel = Parameters<typeof generateText>[0]["model"];

export function resolveConfiguredSumiModel(
  configuredModel: SumiModelReference | null,
): ResolvedSumiModel | null {
  if (!configuredModel) {
    return null;
  }

  const storedModel = getModelById(
    `${configuredModel.providerId}:${configuredModel.providerModelId}`,
  );
  if (storedModel && storedModel.lifecycleStatus !== "active") {
    return null;
  }

  return {
    providerId: configuredModel.providerId,
    providerModelId: configuredModel.providerModelId,
  };
}

export async function createSumiLanguageModel(
  modelTarget: ResolvedSumiModel,
): Promise<SumiLanguageModel | null> {
  const provider = getProviderById(modelTarget.providerId);
  if (!provider) {
    return null;
  }

  try {
    const providerRuntime = await resolveProviderRuntimeContext(provider);
    return await createLanguageModel({
      providerRow: provider,
      providerRuntime,
      providerModelId: modelTarget.providerModelId,
    });
  } catch {
    return null;
  }
}

export function sumiModelAcceptsTemperature(modelTarget: ResolvedSumiModel): boolean {
  const provider = getProviderById(modelTarget.providerId);
  if (!provider) {
    return false;
  }

  const storedModel = getModelById(`${modelTarget.providerId}:${modelTarget.providerModelId}`);
  return getModelTemperatureMax(provider.catalogId as ProviderId, storedModel?.metadata) !== null;
}
