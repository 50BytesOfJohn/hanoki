import { describe, expect, it } from "vitest";
import { getModelTemperatureMax, isTemperature } from "./temperature";

describe("temperature settings", () => {
  it.each([0, 0.7, 1, 1.6, 2])("accepts %s", (value) => {
    expect(isTemperature(value)).toBe(true);
  });

  it.each([-0.1, 2.1, NaN, Infinity, -Infinity, "0.7", null, undefined])("rejects %s", (value) => {
    expect(isTemperature(value)).toBe(false);
  });

  it("uses OpenRouter's range and explicit model support", () => {
    expect(getModelTemperatureMax("openrouter", { supported_parameters: ["temperature"] })).toBe(2);
    expect(
      getModelTemperatureMax("openrouter", { supported_parameters: ["tools", "reasoning"] }),
    ).toBeNull();
    expect(getModelTemperatureMax("openrouter", { supported_parameters: [] })).toBeNull();
    // Missing metadata means unknown support, not an explicit prohibition.
    expect(getModelTemperatureMax("openrouter", {})).toBe(2);
  });

  it("keeps the conservative direct-provider range and disables Codex overrides", () => {
    expect(getModelTemperatureMax("anthropic", {})).toBe(1);
    expect(getModelTemperatureMax("codex", {})).toBeNull();
  });
});
