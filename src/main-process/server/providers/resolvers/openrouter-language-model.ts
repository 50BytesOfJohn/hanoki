import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ParsedProviderRuntimeConfigValue } from "../../../providers/runtime-config";
import type { LanguageModelResolver } from "../language-model-types";

export const createOpenRouterLanguageModel: LanguageModelResolver = async ({
  providerRuntime,
  providerModelId,
}) => {
  const apiKey = readRequiredOpenRouterApiKey(providerRuntime.parsedConfig.apiKey);
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(providerModelId);
};

function readRequiredOpenRouterApiKey(value: ParsedProviderRuntimeConfigValue | undefined): string {
  if (value == null || value === "") {
    throw new Error('Missing required runtime config field "apiKey" for provider "openrouter".');
  }

  // SAFETY: OpenRouter catalog only defines a required secret `apiKey`.
  // parseStoredProviderConfig stores secret fields as strings.
  return value as string;
}
