import type { LanguageModelUsage } from "ai";
import type { ProviderId } from "@shared/providers/catalog";
import type { ChatMessageMetadata } from "@shared/chat/message-metadata";
import type { ModelTableRow } from "../../models/repository";
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
  model: ModelTableRow,
  generationTimeMs: number,
  finishReason: string,
): Omit<ChatMessageMetadata, "parentId"> {
  const providerExtras = providerAdapters[providerId]?.(usage) ?? {};
  const cost = calculateUsageCost(model.metadata, usage);

  return {
    usage,
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      total: usage.totalTokens,
      cached: usage.inputTokenDetails?.cacheReadTokens,
      cacheWrite: usage.inputTokenDetails?.cacheWriteTokens,
      reasoning: usage.outputTokenDetails?.reasoningTokens,
    },
    ...(cost ? { cost } : {}),
    times: { generation: generationTimeMs },
    provider: providerId,
    model: model.id,
    finishReason,
    ...providerExtras,
  };
}

function calculateUsageCost(
  modelMetadata: Record<string, unknown>,
  usage: LanguageModelUsage,
): ChatMessageMetadata["cost"] | undefined {
  const pricing = readPricing(modelMetadata);
  if (!pricing) {
    return undefined;
  }

  const input = multiplyTokenPrice(usage.inputTokens, pricing.input);
  const output = multiplyTokenPrice(usage.outputTokens, pricing.output);
  const total = addCosts(input, output);

  if (input === undefined && output === undefined && total === undefined) {
    return undefined;
  }

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
    currency: "USD",
  };
}

function readPricing(
  modelMetadata: Record<string, unknown>,
): { input?: number; output?: number } | undefined {
  const pricing = modelMetadata.pricing;
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    return undefined;
  }

  const pricingRecord = pricing as Record<string, unknown>;
  const input = parseTokenPrice(pricingRecord.prompt);
  const output = parseTokenPrice(pricingRecord.completion);

  if (input === undefined && output === undefined) {
    return undefined;
  }

  return { input, output };
}

function parseTokenPrice(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function multiplyTokenPrice(tokens: number | undefined, price: number | undefined) {
  if (tokens === undefined || price === undefined) {
    return undefined;
  }

  return tokens * price;
}

function addCosts(...values: Array<number | undefined>) {
  const knownValues = values.filter((value): value is number => value !== undefined);
  if (knownValues.length === 0) {
    return undefined;
  }

  return knownValues.reduce((sum, value) => sum + value, 0);
}
