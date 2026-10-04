import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { ProviderId } from "@shared/providers/catalog";
import type { ReasoningEffort } from "@shared/models/reasoning";
import { buildReasoningProviderOptions } from "./reasoning-provider-options";

export function buildChatProviderOptions(
  providerId: ProviderId,
  effort: ReasoningEffort | undefined,
  temperature: number | undefined,
): SharedV4ProviderOptions | undefined {
  const options = buildReasoningProviderOptions(providerId, effort);
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
