import type { LanguageModelUsage } from "ai";
import type { ProviderId } from "@shared/providers/catalog";
import type { ChatMessageMetadata } from "@shared/chat/message-metadata";
import { extractOpenRouterMetadata } from "./resolvers/openrouter-metadata";
import { extractOllamaMetadata } from "./resolvers/ollama-metadata";

type ProviderMetadataAdapter = (
  usage: LanguageModelUsage,
) => Partial<Omit<ChatMessageMetadata, "parentId">>;

const providerAdapters: Partial<Record<ProviderId, ProviderMetadataAdapter>> = {
  openrouter: extractOpenRouterMetadata,
  ollama: extractOllamaMetadata,
};

/**
 * Build response metadata from AI SDK usage data merged with any provider-specific extras.
 * First populates fields from LanguageModelUsage, then merges the provider adapter's result
 * which may add or override fields for provider-specific data not covered by the AI SDK.
 */
export function buildResponseMetadata(
  usage: LanguageModelUsage,
  providerId: ProviderId,
  modelId: string,
  generationTimeMs: number,
): Omit<ChatMessageMetadata, "parentId"> {
  const providerExtras = providerAdapters[providerId]?.(usage) ?? {};

  return {
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cached: usage.inputTokenDetails?.cacheReadTokens,
    },
    times: { generation: generationTimeMs },
    provider: providerId,
    model: modelId,
    ...providerExtras,
  };
}
