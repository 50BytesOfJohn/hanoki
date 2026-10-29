import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { normalizeOpenAiCompatibleBaseUrl } from "../../../providers/openai-compatible-base-url";
import type { LanguageModelResolver } from "../language-model-types";

export const createOpenAiCompatibleLanguageModel: LanguageModelResolver = async ({
  providerRuntime,
  providerModelId,
}) => {
  const { baseUrl, apiKey } = providerRuntime.parsedConfig;
  if (typeof baseUrl !== "string" || !baseUrl) {
    throw new Error(
      'Missing required runtime config field "baseUrl" for provider "openai-compatible".',
    );
  }

  const provider = createOpenAICompatible({
    name: "openai-compatible",
    baseURL: normalizeOpenAiCompatibleBaseUrl(baseUrl),
    apiKey: typeof apiKey === "string" && apiKey ? apiKey : undefined,
    includeUsage: true,
  });

  return provider.chatModel(providerModelId);
};
