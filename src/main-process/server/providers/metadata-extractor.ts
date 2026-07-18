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
 * Build response metadata from known request details and any available AI SDK usage data.
 */
export function buildResponseMetadata(
  usage: LanguageModelUsage | undefined,
  providerId: ProviderId,
  model: ModelTableRow,
  generationTimeMs: number,
  finishReason?: string,
): Omit<ChatMessageMetadata, "parentId"> {
  const providerExtras = usage ? (providerAdapters[providerId]?.(usage) ?? {}) : {};
  const cost = usage ? calculateUsageCost(model.metadata, usage) : undefined;

  return {
    ...(usage
      ? {
          usage,
          tokens: {
            input: usage.inputTokens,
            output: usage.outputTokens,
            total: usage.totalTokens,
            cached: usage.inputTokenDetails?.cacheReadTokens,
            cacheWrite: usage.inputTokenDetails?.cacheWriteTokens,
            reasoning: usage.outputTokenDetails?.reasoningTokens,
          },
        }
      : {}),
    ...(cost ? { cost } : {}),
    times: { generation: generationTimeMs },
    provider: providerId,
    model: model.id,
    ...(finishReason ? { finishReason } : {}),
    ...providerExtras,
  };
}

export function mergeLanguageModelUsage(
  current: LanguageModelUsage | undefined,
  next: LanguageModelUsage,
): LanguageModelUsage {
  if (!current) {
    return next;
  }

  return {
    inputTokens: addTokenCounts(current.inputTokens, next.inputTokens),
    inputTokenDetails: {
      noCacheTokens: addTokenCounts(
        current.inputTokenDetails.noCacheTokens,
        next.inputTokenDetails.noCacheTokens,
      ),
      cacheReadTokens: addTokenCounts(
        current.inputTokenDetails.cacheReadTokens,
        next.inputTokenDetails.cacheReadTokens,
      ),
      cacheWriteTokens: addTokenCounts(
        current.inputTokenDetails.cacheWriteTokens,
        next.inputTokenDetails.cacheWriteTokens,
      ),
    },
    outputTokens: addTokenCounts(current.outputTokens, next.outputTokens),
    outputTokenDetails: {
      textTokens: addTokenCounts(
        current.outputTokenDetails.textTokens,
        next.outputTokenDetails.textTokens,
      ),
      reasoningTokens: addTokenCounts(
        current.outputTokenDetails.reasoningTokens,
        next.outputTokenDetails.reasoningTokens,
      ),
    },
    totalTokens: addTokenCounts(current.totalTokens, next.totalTokens),
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

function addTokenCounts(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) {
    return undefined;
  }

  return (left ?? 0) + (right ?? 0);
}
