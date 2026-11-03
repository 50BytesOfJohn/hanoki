import { describe, expect, it } from "vitest";
import { getModelDetails } from "@shared/models/model-details";
import { getModelReasoningEfforts } from "@shared/models/reasoning";
import { sdkProviderRegistry } from "./sdk-provider-registry";

const modelList = {
  data: [
    { id: "claude-haiku-5-5-2", owned_by: "claude", supported_endpoint_types: ["anthropic"] },
    { id: "deepseek-v4-pro", owned_by: "openai", supported_endpoint_types: ["openai"] },
    { id: "glm-5.3-flash-abliterated-2", owned_by: "openai" },
    { id: "gpt-image-2", owned_by: "openai" },
    { id: "gemini-3-stt", owned_by: "openai" },
    { id: "veo-3.1", owned_by: "task plugin" },
    { id: "mimo-v2.6-flash-uncensored-thinking", owned_by: "openai" },
    { id: "outrun-redteam-pro", owned_by: "openai" },
  ],
};

const catalog = {
  models: [
    {
      id: "claude-haiku-5-5-2",
      name: "Claude Haiku 5.5 (2)",
      kind: "text",
      tiers: [{ prices: { input: 0.02, output: 0.1, cache_read: 0.002 } }],
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      kind: "text",
      tiers: [{ prices: { input: 1.35, output: 4.05 } }],
    },
    { id: "gpt-image-2", name: "GPT Image 2", kind: "image", tiers: [] },
    { id: "gemini-3-stt", name: "Gemini 3 STT", kind: "text", tiers: [] },
    { id: "veo-3.1", name: "Veo 3.1", kind: "video", tiers: [] },
    { id: "mimo-v2.6-flash-uncensored-thinking", name: "MiMo Thinking", kind: "text", tiers: [] },
    { id: "outrun-redteam-pro", name: "Outrun Red Team Pro", kind: "text", tiers: [] },
  ],
};

describe("outrun model sync", () => {
  it("fetches the public price list as its catalog", () => {
    expect(sdkProviderRegistry.outrun.buildModelsRequest("key").url).toBe(
      "https://api.outrun.to/v1/models",
    );
    expect(sdkProviderRegistry.outrun.buildCatalogRequest().url).toBe(
      "https://api.outrun.to/pricing",
    );
  });

  it("keeps only text chat models that are in both lists", () => {
    const models = sdkProviderRegistry.outrun.parseModels(modelList, catalog);

    expect(models.map((model) => model.providerModelId)).toEqual([
      "claude-haiku-5-5-2",
      "deepseek-v4-pro",
      "mimo-v2.6-flash-uncensored-thinking",
      "outrun-redteam-pro",
    ]);
  });

  it("names the real model maker and reads prices from the catalog", () => {
    const [claude, deepseek] = sdkProviderRegistry.outrun.parseModels(modelList, catalog);

    expect(claude?.displayName).toBe("Claude Haiku 5.5 (2)");
    expect(getModelDetails(claude?.metadata, "claude-haiku-5-5-2")).toMatchObject({
      creator: "anthropic",
      pricing: { input: 0.02, output: 0.1, cachedInput: 0.002 },
    });
    expect(getModelDetails(deepseek?.metadata, "deepseek-v4-pro").creator).toBe("deepseek");
  });

  it("hides the effort menu for models that reject reasoning_effort", () => {
    const models = sdkProviderRegistry.outrun.parseModels(modelList, catalog);
    const effortsById = new Map(
      models.map((model) => [
        model.providerModelId,
        getModelReasoningEfforts("outrun", model.metadata),
      ]),
    );

    expect(effortsById.get("mimo-v2.6-flash-uncensored-thinking")).toEqual([]);
    expect(effortsById.get("deepseek-v4-pro")).toEqual(["low", "medium", "high"]);
  });

  it("still syncs without the catalog, skipping only video task models", () => {
    const models = sdkProviderRegistry.outrun.parseModels(modelList);

    expect(models.map((model) => model.providerModelId)).not.toContain("veo-3.1");
    expect(models).toHaveLength(modelList.data.length - 1);
  });
});
