import { describe, expect, it } from "vitest";

import {
  clampReasoningEffort,
  getEffortBarCount,
  getEffortForBarCount,
  getModelReasoningEfforts,
  parseReasoningEffortAlias,
  resolveReasoningEffortForModel,
  stepReasoningEffort,
} from "./reasoning";

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

describe("clampReasoningEffort", () => {
  it("keeps a level the model offers", () => {
    expect(clampReasoningEffort("high", ["low", "medium", "high"])).toBe("high");
  });

  it("maps to the nearest offered level, preferring the lighter one on ties", () => {
    expect(clampReasoningEffort("xhigh", ["none", "low", "medium", "high"])).toBe("high");
    expect(clampReasoningEffort("none", ["low", "medium", "high"])).toBe("low");
    expect(clampReasoningEffort("medium", ["none", "high"])).toBe("high");
    expect(clampReasoningEffort("minimal", ["none", "low"])).toBe("none");
  });

  it("returns null when nothing is offered", () => {
    expect(clampReasoningEffort("high", [])).toBeNull();
  });
});

describe("resolveReasoningEffortForModel", () => {
  const offered = ["none", "low", "medium", "high"] as const;

  it("prefers the level last used with the model", () => {
    expect(resolveReasoningEffortForModel({ offered, remembered: "low", carried: "high" })).toBe(
      "low",
    );
  });

  it("honours a remembered Default over the carried level", () => {
    expect(
      resolveReasoningEffortForModel({ offered, remembered: null, carried: "high" }),
    ).toBeNull();
  });

  it("carries the previous level over to a model that has none yet", () => {
    expect(
      resolveReasoningEffortForModel({ offered, remembered: undefined, carried: "xhigh" }),
    ).toBe("high");
  });

  it("falls back to Default", () => {
    expect(
      resolveReasoningEffortForModel({ offered, remembered: undefined, carried: null }),
    ).toBeNull();
  });

  it("returns null for models that do not reason", () => {
    expect(
      resolveReasoningEffortForModel({ offered: [], remembered: "high", carried: "high" }),
    ).toBeNull();
  });
});

describe("stepReasoningEffort", () => {
  const offered = ["low", "medium", "high"] as const;

  it("walks from Default through the offered levels and stops at the ends", () => {
    expect(stepReasoningEffort(null, offered, 1)).toBe("low");
    expect(stepReasoningEffort("high", offered, 1)).toBe("high");
    expect(stepReasoningEffort("low", offered, -1)).toBeNull();
    expect(stepReasoningEffort(null, offered, -1)).toBeNull();
  });

  it("wraps when asked", () => {
    expect(stepReasoningEffort("high", offered, 1, { wrap: true })).toBeNull();
    expect(stepReasoningEffort(null, offered, -1, { wrap: true })).toBe("high");
  });

  it("treats a level the model lacks as Default", () => {
    expect(stepReasoningEffort("xhigh", offered, 1)).toBe("low");
  });
});

describe("parseReasoningEffortAlias", () => {
  it("understands the menu labels and common short forms", () => {
    expect(parseReasoningEffortAlias("Max")).toBe("xhigh");
    expect(parseReasoningEffortAlias("med")).toBe("medium");
    expect(parseReasoningEffortAlias("off")).toBe("none");
    expect(parseReasoningEffortAlias("opus")).toBeNull();
  });
});

describe("effort bars", () => {
  const anthropic = ["none", "low", "medium", "high"] as const;
  const deepseek = ["low", "medium", "high", "xhigh"] as const;

  it("counts the bars a level lights", () => {
    expect(getEffortBarCount("high", anthropic)).toBe(3);
    expect(getEffortBarCount("none", anthropic)).toBe(0);
    expect(getEffortBarCount(null, anthropic)).toBe(0);
  });

  it("maps a digit to the level with that many bars", () => {
    expect(getEffortForBarCount(2, anthropic)).toBe("medium");
    expect(getEffortForBarCount(0, anthropic)).toBe("none");
    expect(getEffortForBarCount(9, anthropic)).toBe("high");
  });

  it("has no Off for models that cannot turn reasoning off", () => {
    expect(getEffortForBarCount(0, deepseek)).toBeUndefined();
    expect(getEffortForBarCount(1, deepseek)).toBe("low");
  });
});
