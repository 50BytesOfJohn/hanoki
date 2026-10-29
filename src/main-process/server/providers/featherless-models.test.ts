import { describe, expect, it } from "vitest";
import { sdkProviderRegistry } from "./sdk-provider-registry";

describe("featherless model sync", () => {
  it("requests the most popular models only", () => {
    const request = sdkProviderRegistry.featherless.buildModelsRequest("key");
    expect(request.url).toBe("https://api.featherless.ai/v1/models?sort=-popularity&per_page=200");
  });

  it("skips speech and classifier models", () => {
    const models = sdkProviderRegistry.featherless.parseModels({
      data: [
        { id: "Qwen/Qwen3-14B", features: { tool_use: true } },
        { id: "Sao10K/Fimbulvetr-11B-v2" },
        { id: "hexgrad/Kokoro-82M", features: { audio_output: true } },
        { id: "some/classifier", features: { classifier: true, image_input: true } },
      ],
    });

    expect(models.map((model) => model.providerModelId)).toEqual([
      "Qwen/Qwen3-14B",
      "Sao10K/Fimbulvetr-11B-v2",
    ]);
  });
});
