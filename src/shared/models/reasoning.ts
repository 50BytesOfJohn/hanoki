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

/** The level closest to `effort` that a model offers; ties go to the lighter one. */
export function clampReasoningEffort(
  effort: ReasoningEffort,
  offered: readonly ReasoningEffort[],
): ReasoningEffort | null {
  if (offered.includes(effort)) {
    return effort;
  }

  const target = REASONING_EFFORT_ORDER.indexOf(effort);
  let closest: ReasoningEffort | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of offered) {
    const distance = Math.abs(REASONING_EFFORT_ORDER.indexOf(candidate) - target);
    if (
      distance < closestDistance ||
      (distance === closestDistance &&
        closest !== null &&
        REASONING_EFFORT_ORDER.indexOf(candidate) < REASONING_EFFORT_ORDER.indexOf(closest))
    ) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}

/**
 * The effort a model starts with when it is picked: the level last used with
 * that model, else the level carried over from the model being replaced, else
 * the provider default (`null`). `remembered` is `undefined` for a model that
 * has never been given an effort, and `null` when "Default" was chosen for it.
 */
export function resolveReasoningEffortForModel({
  offered,
  remembered,
  carried,
}: {
  offered: readonly ReasoningEffort[];
  remembered: ReasoningEffort | null | undefined;
  carried: ReasoningEffort | null | undefined;
}): ReasoningEffort | null {
  if (offered.length === 0) {
    return null;
  }

  if (remembered !== undefined) {
    return remembered === null ? null : clampReasoningEffort(remembered, offered);
  }

  return carried ? clampReasoningEffort(carried, offered) : null;
}

/**
 * Steps through "Default" followed by the offered levels. Stops at either end
 * unless `wrap` is set, which suits a single cycle shortcut.
 */
export function stepReasoningEffort(
  current: ReasoningEffort | null,
  offered: readonly ReasoningEffort[],
  direction: 1 | -1,
  { wrap = false }: { wrap?: boolean } = {},
): ReasoningEffort | null {
  if (offered.length === 0) {
    return null;
  }

  const steps: (ReasoningEffort | null)[] = [null, ...offered];
  const index = Math.max(0, steps.indexOf(current));
  const next = index + direction;

  if (wrap) {
    return steps[(next + steps.length) % steps.length] ?? null;
  }

  return steps[Math.min(steps.length - 1, Math.max(0, next))] ?? null;
}

export function formatReasoningEffort(effort: ReasoningEffort | null): string {
  return effort ? REASONING_EFFORT_LABELS[effort] : "Default";
}

/** Words a search can use to ask for a level, e.g. "opus high". */
const REASONING_EFFORT_ALIASES = new Map<string, ReasoningEffort>([
  ["off", "none"],
  ["none", "none"],
  ["minimal", "minimal"],
  ["min", "minimal"],
  ["low", "low"],
  ["medium", "medium"],
  ["med", "medium"],
  ["high", "high"],
  ["max", "xhigh"],
  ["xhigh", "xhigh"],
]);

export function parseReasoningEffortAlias(word: string): ReasoningEffort | null {
  return REASONING_EFFORT_ALIASES.get(word.toLowerCase()) ?? null;
}

/** Levels drawn as bars: everything above "Off". */
export function getEffortBarLevels(offered: readonly ReasoningEffort[]): ReasoningEffort[] {
  return offered.filter((effort) => effort !== "none");
}

/** How many bars a level lights up; Off and Default light none. */
export function getEffortBarCount(
  effort: ReasoningEffort | null,
  offered: readonly ReasoningEffort[],
): number {
  return effort === null || effort === "none" ? 0 : getEffortBarLevels(offered).indexOf(effort) + 1;
}

/**
 * The level with `count` bars lit, so a digit key means "this many bars".
 * 0 is Off; counts past the top land on the highest level. Returns
 * `undefined` when the model has no such level (0 without an Off).
 */
export function getEffortForBarCount(
  count: number,
  offered: readonly ReasoningEffort[],
): ReasoningEffort | undefined {
  if (count <= 0) {
    return offered.includes("none") ? "none" : undefined;
  }

  const levels = getEffortBarLevels(offered);
  return levels[Math.min(count, levels.length) - 1];
}
