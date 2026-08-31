import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { ProviderId } from "@shared/providers/catalog";
import type { ReasoningEffort } from "@shared/models/reasoning";

/**
 * OpenRouter and Hugging Face have not adopted the AI SDK's standardized
 * `reasoning` call setting yet, so their effort rides in provider options
 * instead. Every other provider we ship reads `reasoning` directly.
 */
export function buildReasoningProviderOptions(
  providerId: ProviderId,
  effort: ReasoningEffort | undefined,
): SharedV4ProviderOptions | undefined {
  if (!effort) {
    return undefined;
  }

  if (providerId === "openrouter") {
    return { openrouter: { reasoning: { effort } } };
  }

  if (providerId === "huggingface") {
    return { huggingface: { reasoningEffort: effort } };
  }

  return undefined;
}
