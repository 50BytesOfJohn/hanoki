import { describe, expect, it } from "vitest";
import type { LanguageModelUsage } from "ai";

import type { ModelTableRow } from "../../models/repository";
import { buildResponseMetadata, mergeLanguageModelUsage } from "./metadata-extractor";

const model = {
  id: "model-row-id",
  providerId: "provider-row-id",
  providerModelId: "provider-model-id",
  canonicalModelId: "canonical-model-id",
  displayName: "Model",
  isEnabled: true,
  lifecycleStatus: "active",
  data: {},
  metadata: {
    pricing: {
      prompt: "0.000001",
      completion: "0.000002",
    },
  },
  extensions: {},
  createdAt: 0,
  updatedAt: 0,
} as ModelTableRow;

describe("buildResponseMetadata", () => {
  it("keeps known request details when usage is unavailable", () => {
    expect(buildResponseMetadata(undefined, "openrouter", model, 1_250, "abort")).toEqual({
      times: { generation: 1_250 },
      provider: "openrouter",
      model: "model-row-id",
      finishReason: "abort",
    });
  });

  it("includes token usage and cost when a provider finished a step", () => {
    const metadata = buildResponseMetadata(
      createUsage({ input: 100, output: 25, cached: 10, reasoning: 5 }),
      "openrouter",
      model,
      500,
      "stop",
    );

    expect(metadata.tokens).toEqual({
      input: 100,
      output: 25,
      total: 125,
      cached: 10,
      cacheWrite: undefined,
      reasoning: 5,
    });
    expect(metadata.cost?.currency).toBe("USD");
    expect(metadata.cost?.input).toBeCloseTo(0.0001);
    expect(metadata.cost?.output).toBeCloseTo(0.00005);
    expect(metadata.cost?.total).toBeCloseTo(0.00015);
  });
});

describe("mergeLanguageModelUsage", () => {
  it("aggregates completed agent steps for interrupted multi-step requests", () => {
    const first = createUsage({ input: 100, output: 10, cached: 20, reasoning: 2 });
    const second = createUsage({ input: 150, output: 15, cached: 30, reasoning: 3 });

    expect(mergeLanguageModelUsage(first, second)).toEqual(
      createUsage({ input: 250, output: 25, cached: 50, reasoning: 5 }),
    );
  });
});

function createUsage({
  input,
  output,
  cached,
  reasoning,
}: {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
}): LanguageModelUsage {
  return {
    inputTokens: input,
    inputTokenDetails: {
      noCacheTokens: input - cached,
      cacheReadTokens: cached,
      cacheWriteTokens: undefined,
    },
    outputTokens: output,
    outputTokenDetails: {
      textTokens: output - reasoning,
      reasoningTokens: reasoning,
    },
    totalTokens: input + output,
  };
}
