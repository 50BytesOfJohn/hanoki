import type { ProviderId } from "../providers/catalog";

export const MAX_TEMPERATURE = 2;

export function isTemperature(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_TEMPERATURE
  );
}

/** Null means the model explicitly does not support a temperature override. */
export function getModelTemperatureMax(
  providerId: ProviderId,
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  if (providerId === "codex") return null;

  if (providerId === "openrouter") {
    const parameters = metadata?.["supported_parameters"];
    if (Array.isArray(parameters) && !parameters.includes("temperature")) return null;
    return MAX_TEMPERATURE;
  }

  // Keep the existing conservative range for direct providers; their model
  // APIs differ (Anthropic, for example, accepts at most 1).
  return 1;
}
