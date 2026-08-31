import { describe, expect, it } from "vitest";

import { getModelReasoningEfforts } from "./reasoning";

describe("getModelReasoningEfforts", () => {
  it("falls back to the provider's levels when the model reports no capabilities", () => {
    // OpenAI's /v1/models says nothing about reasoning.
    expect(getModelReasoningEfforts("openai", { id: "gpt-5.1", object: "model" })).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("offers nothing when a model that does report capabilities cannot reason", () => {
    expect(
      getModelReasoningEfforts("openrouter", {
        id: "openai/gpt-4o",
        supported_parameters: ["tools", "response_format"],
      }),
    ).toEqual([]);
  });

  it("keeps the provider's levels when the model advertises reasoning", () => {
    expect(
      getModelReasoningEfforts("anthropic", {
        id: "claude-opus-4",
        capabilities: { thinking: { supported: true } },
      }),
    ).toEqual(["none", "low", "medium", "high"]);
  });

  it("uses the exact levels Codex publishes, in canonical order", () => {
    expect(
      getModelReasoningEfforts("codex", {
        slug: "gpt-5.1-codex",
        supported_reasoning_levels: [{ effort: "xhigh" }, { effort: "low" }, { effort: "medium" }],
      }),
    ).toEqual(["low", "medium", "xhigh"]);
  });

  it("ignores unknown levels rather than passing them to the provider", () => {
    expect(
      getModelReasoningEfforts("codex", {
        slug: "gpt-5.1-codex",
        supported_reasoning_levels: [{ effort: "turbo" }],
      }),
    ).toEqual(["low", "medium", "high", "xhigh"]);
  });
});
