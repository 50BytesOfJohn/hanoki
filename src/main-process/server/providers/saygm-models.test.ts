import { describe, expect, it } from "vitest";
import { getModelDetails } from "@shared/models/model-details";
import { getModelReasoningEfforts } from "@shared/models/reasoning";
import {
  getSayGmApiRoute,
  parseSayGmCreditBalance,
  readSayGmBilledCost,
} from "@shared/providers/saygm";
import { sdkProviderRegistry } from "./sdk-provider-registry";

/** Trimmed entries from the live `GET /v1/models`. */
const modelList = {
  object: "list",
  data: [
    {
      id: "gpt-6-luna",
      display_name: "GPT-6 Luna",
      owned_by: "openai",
      available: true,
      api_shapes: ["responses", "chat.completions"],
      capabilities: { vision: true, tools: true },
      pricing: {
        dimensions: {
          input_per_mtok_ndollars: 100_000_000,
          output_per_mtok_ndollars: 400_000_000,
          cache_read_per_mtok_ndollars: 10_000_000,
        },
      },
    },
    {
      id: "claude-haiku-5-5",
      display_name: "Claude Haiku 5.5",
      owned_by: "anthropic",
      api_shapes: ["messages", "chat.completions"],
      capabilities: { vision: true, tools: true },
    },
    {
      id: "gemini-3.1-flash-lite",
      display_name: "Gemini 3.1 Flash Lite",
      owned_by: "google",
      api_shapes: ["generateContent", "streamGenerateContent", "chat.completions"],
      capabilities: { tools: true },
    },
    {
      id: "glm-5.3-flash",
      display_name: "GLM 5.3 Flash",
      owned_by: "zai",
      api_shapes: ["chat.completions"],
      capabilities: { tools: true },
      reasoning_efforts: ["low", "high", "max"],
    },
    {
      id: "glm-5.3-flash-tee",
      display_name: "GLM 5.3 Flash",
      owned_by: "zai",
      confidential: true,
      api_shapes: ["chat.completions"],
    },
    { id: "gpt-image-3", display_name: "GPT Image 3", api_shapes: ["images.generations"] },
    { id: "veo-4", display_name: "Veo 4", api_shapes: ["videos"] },
    { id: "retired-model", available: false, api_shapes: ["chat.completions"] },
  ],
};

describe("saygm model sync", () => {
  it("keeps only available models that can hold a chat", () => {
    const models = sdkProviderRegistry.saygm.parseModels(modelList);

    expect(models.map((model) => model.providerModelId)).toEqual([
      "gpt-6-luna",
      "claude-haiku-5-5",
      "gemini-3.1-flash-lite",
      "glm-5.3-flash",
      "glm-5.3-flash-tee",
    ]);
  });

  it("converts nano-dollar prices per million tokens into USD per token", () => {
    const [luna] = sdkProviderRegistry.saygm.parseModels(modelList);

    expect(getModelDetails(luna?.metadata, "gpt-6-luna")).toMatchObject({
      pricing: { input: 0.1, output: 0.4, cachedInput: 0.01 },
    });
  });

  it("tells enclave models apart by name", () => {
    const models = sdkProviderRegistry.saygm.parseModels(modelList);

    expect(models.at(-1)?.displayName).toBe("GLM 5.3 Flash (TEE)");
  });

  it("sends each model over its richest chat format", () => {
    const routes = Object.fromEntries(
      modelList.data.map((model) => [model.id, getSayGmApiRoute(model.id, model)]),
    );

    expect(routes).toMatchObject({
      "gpt-6-luna": "responses",
      "claude-haiku-5-5": "messages",
      "gemini-3.1-flash-lite": "gemini",
      "glm-5.3-flash": "chat",
      "gpt-image-3": null,
    });
    // Without the catalog entry the id decides.
    expect(getSayGmApiRoute("gpt-oss-120b", undefined)).toBe("chat");
    expect(getSayGmApiRoute("o4-mini", undefined)).toBe("responses");
  });

  it("offers the levels each route accepts, unless the model publishes its own", () => {
    const models = sdkProviderRegistry.saygm.parseModels(modelList);
    const effortsById = Object.fromEntries(
      models.map((model) => [
        model.providerModelId,
        getModelReasoningEfforts("saygm", model.metadata),
      ]),
    );

    expect(effortsById).toEqual({
      "gpt-6-luna": ["none", "low", "medium", "high", "xhigh"],
      "claude-haiku-5-5": ["none", "low", "medium", "high"],
      "gemini-3.1-flash-lite": ["none", "minimal", "low", "medium", "high"],
      "glm-5.3-flash": ["low", "high", "xhigh"],
      "glm-5.3-flash-tee": ["low", "medium", "high"],
    });
  });
});

describe("saygm billing", () => {
  it("reads the credit balance in dollars", () => {
    expect(
      parseSayGmCreditBalance({
        object: "credit_balance",
        balance: { usd: "0.9871", nano_usd: 987_100_000 },
        spent: { usd: "0.0129", nano_usd: 12_900_000 },
      }),
    ).toEqual({ balance: 0.9871, spent: 0.0129 });
    expect(parseSayGmCreditBalance({ balance: { nano_usd: 5e9 } })).toEqual({
      balance: 5,
      spent: null,
    });
    expect(() => parseSayGmCreditBalance({})).toThrow();
  });

  it("reads the billed cost from every wire format's usage", () => {
    expect(readSayGmBilledCost({ cost_nano_usd: 41_250, cost: 0.00004125 })).toBe(0.00004125);
    expect(readSayGmBilledCost({ costNanoUsd: 1_500 })).toBe(0.0000015);
    expect(readSayGmBilledCost({ cost: 0.002 })).toBe(0.002);
    expect(readSayGmBilledCost({ prompt_tokens: 10 })).toBeNull();
    expect(readSayGmBilledCost(undefined)).toBeNull();
  });
});
