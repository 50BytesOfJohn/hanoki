/**
 * Thinking effort, the AI SDK v7 way.
 *
 * `streamText`/`ToolLoopAgent` take a standardized `reasoning` setting and each
 * provider adapter translates it into its own dialect — `reasoning_effort`
 * (OpenAI, Groq, xAI, DeepSeek, Together), `thinking.budget_tokens` (Anthropic,
 * Cohere), `thinkingLevel`/`thinkingBudget` (Google), `think` (Ollama). Only
 * OpenRouter and Hugging Face still need provider options; see
 * `buildReasoningProviderOptions`.
 *
 * Levels outside a provider's own set are silently mapped down to the nearest
 * one, so the menu offers only what actually changes the request.
 */
import type { ProviderId } from "../providers/catalog";
import { getModelCapabilities } from "./model-details";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

const REASONING_EFFORT_ORDER: readonly ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export const REASONING_EFFORT_LABELS = {
  none: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
} satisfies Record<ReasoningEffort, string>;

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && value in REASONING_EFFORT_LABELS;
}

/** Read off the `effortMap`s in each `@ai-sdk/*` adapter. */
const REASONING_EFFORTS_BY_PROVIDER = {
  openai: ["none", "minimal", "low", "medium", "high", "xhigh"],
  openrouter: ["none", "minimal", "low", "medium", "high", "xhigh"],
  google: ["none", "minimal", "low", "medium", "high"],
  anthropic: ["none", "low", "medium", "high"],
  xai: ["none", "low", "medium", "high"],
  groq: ["none", "low", "medium", "high"],
  cohere: ["none", "low", "medium", "high"],
  ollama: ["none", "low", "medium", "high"],
  mistral: ["none", "high"],
  // "none" is dropped rather than sent as a disable flag, so it would be a no-op.
  deepseek: ["low", "medium", "high", "xhigh"],
  togetherai: ["low", "medium", "high"],
  huggingface: ["low", "medium", "high"],
  codex: ["low", "medium", "high", "xhigh"],
} satisfies Record<ProviderId, readonly ReasoningEffort[]>;

/**
 * The efforts to offer for one model.
 *
 * Codex is the only provider that publishes per-model levels. Everyone else
 * either advertises capabilities (OpenRouter, Anthropic, Ollama, Mistral…) —
 * in which case a model without `reasoning` gets nothing — or reports no
 * capabilities at all (OpenAI, DeepSeek, Together…), where guessing from the
 * model id would be worse than letting the user decide.
 */
export function getModelReasoningEfforts(
  providerId: ProviderId,
  metadata: Record<string, unknown> | null | undefined,
): ReasoningEffort[] {
  const codexLevels = readCodexReasoningLevels(metadata);
  if (codexLevels.length > 0) {
    return codexLevels;
  }

  const capabilities = getModelCapabilities(metadata);
  if (capabilities.length > 0 && !capabilities.includes("reasoning")) {
    return [];
  }

  return [...REASONING_EFFORTS_BY_PROVIDER[providerId]];
}

function readCodexReasoningLevels(
  metadata: Record<string, unknown> | null | undefined,
): ReasoningEffort[] {
  const levels = metadata?.["supported_reasoning_levels"];
  if (!Array.isArray(levels)) {
    return [];
  }

  const efforts = levels
    .map((level) =>
      level && typeof level === "object" ? (level as Record<string, unknown>)["effort"] : level,
    )
    .filter(isReasoningEffort);

  // Keep the canonical ordering rather than whatever the backend listed.
  return REASONING_EFFORT_ORDER.filter((effort) => efforts.includes(effort));
}
