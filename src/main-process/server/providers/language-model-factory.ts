import type { LanguageModel } from "ai";
import type { ProviderId } from "@shared/providers/catalog";
import type { CreateLanguageModelInput, LanguageModelResolver } from "./language-model-types";
import { getSdkProviderRegistryEntry } from "./sdk-provider-registry";

const languageModelResolvers = buildLanguageModelResolvers();

export async function createLanguageModel(input: CreateLanguageModelInput): Promise<LanguageModel> {
  if (input.providerRow.catalogId !== input.providerRuntime.providerDef.id) {
    throw new Error(
      `Provider runtime context mismatch for provider row "${input.providerRow.id}".`,
    );
  }

  return languageModelResolvers[input.providerRuntime.providerDef.id](input);
}

function buildLanguageModelResolvers(): Record<ProviderId, LanguageModelResolver> {
  return {
    openrouter: createApiKeyLanguageModelResolver("openrouter"),
    openai: createApiKeyLanguageModelResolver("openai"),
    anthropic: createApiKeyLanguageModelResolver("anthropic"),
    google: createApiKeyLanguageModelResolver("google"),
    groq: createApiKeyLanguageModelResolver("groq"),
    xai: createApiKeyLanguageModelResolver("xai"),
    mistral: createApiKeyLanguageModelResolver("mistral"),
    togetherai: createApiKeyLanguageModelResolver("togetherai"),
    deepseek: createApiKeyLanguageModelResolver("deepseek"),
    cohere: createApiKeyLanguageModelResolver("cohere"),
    huggingface: createApiKeyLanguageModelResolver("huggingface"),
    ollama: async (input) => {
      const { createOllamaLanguageModel } = await import("./resolvers/ollama-language-model");
      return createOllamaLanguageModel(input);
    },
    codex: async (input) => {
      const { createCodexLanguageModel } = await import("./resolvers/codex-language-model");
      return createCodexLanguageModel(input);
    },
  };
}

function createApiKeyLanguageModelResolver(providerId: Exclude<ProviderId, "ollama">) {
  return async ({ providerRuntime, providerModelId }: CreateLanguageModelInput) => {
    const apiKey = providerRuntime.parsedConfig.apiKey;
    if (typeof apiKey !== "string" || !apiKey) {
      throw new Error(
        `Missing required runtime config field "apiKey" for provider "${providerId}".`,
      );
    }

    const providerEntry = getSdkProviderRegistryEntry(providerId);
    if (!providerEntry) {
      throw new Error(`Provider "${providerId}" is not registered.`);
    }

    return providerEntry.createLanguageModel(apiKey, providerModelId);
  };
}
