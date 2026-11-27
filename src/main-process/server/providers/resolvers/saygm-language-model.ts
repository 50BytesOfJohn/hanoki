import { getModelById } from "../../../models/repository";
import type { LanguageModelResolver } from "../language-model-types";
import { createSayGmLanguageModel } from "../sdk-provider-registry";

/**
 * SayGM models are called over different wire formats, picked from the
 * catalog entry stored at sync time; see `getSayGmApiRoute`.
 */
export const createSayGmLanguageModelForRow: LanguageModelResolver = async ({
  providerRow,
  providerRuntime,
  providerModelId,
}) => {
  const apiKey = providerRuntime.parsedConfig.apiKey;
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error('Missing required runtime config field "apiKey" for provider "saygm".');
  }

  const metadata = getModelById(`${providerRow.id}:${providerModelId}`)?.metadata;
  return createSayGmLanguageModel(apiKey, providerModelId, metadata ?? undefined);
};
