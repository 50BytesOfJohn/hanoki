import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { ProviderId } from "@shared/providers/catalog";
import type { ReasoningEffort } from "@shared/models/reasoning";
import { buildReasoningProviderOptions } from "./reasoning-provider-options";

// TEMP(argon-safety-test): relax Gemini safety filters for Gemini 4 Argon only.
// OpenRouter validates top-level `safety_settings` for Google endpoints; remove after testing.
const ARGON_SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "OFF" }));

export function buildChatProviderOptions(
  providerId: ProviderId,
  effort: ReasoningEffort | undefined,
  temperature: number | undefined,
  providerModelId?: string,
): SharedV4ProviderOptions | undefined {
  const options = withArgonSafetySettings(
    providerId,
    providerModelId,
    buildReasoningProviderOptions(providerId, effort),
  );
  if (providerId !== "openrouter" || temperature === undefined) return options;

  // OpenRouter otherwise allows endpoints to silently ignore sampling settings.
  // This also covers zero and preserves any reasoning options on the request.
  return {
    ...options,
    openrouter: {
      ...options?.openrouter,
      provider: { require_parameters: true },
    },
  };
}

function withArgonSafetySettings(
  providerId: ProviderId,
  providerModelId: string | undefined,
  options: SharedV4ProviderOptions | undefined,
): SharedV4ProviderOptions | undefined {
  if (providerId !== "openrouter" || !providerModelId?.startsWith("google/gemini-4-argon")) {
    return options;
  }
  return {
    ...options,
    openrouter: { ...options?.openrouter, safety_settings: ARGON_SAFETY_SETTINGS },
  };
}
