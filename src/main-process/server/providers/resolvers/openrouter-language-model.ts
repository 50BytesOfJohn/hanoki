import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelResolver } from "../language-model-types";

export const createOpenRouterLanguageModel: LanguageModelResolver = ({
  providerRuntime,
  providerModelId,
}) => {
  const apiKey = providerRuntime.parsedConfig.apiKey;
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error('Missing required runtime config field "apiKey" for provider "openrouter".');
  }

  const openrouter = createOpenRouter({ apiKey });
  return openrouter(providerModelId);
};
