/**
 * Every provider returns a different model-list shape, and we persist the raw
 * payload verbatim in `models.metadata`. This flattens whatever is there into
 * the handful of facts the UI shows, leaving anything a provider omits `null`.
 *
 * Verified against live payloads / API docs for: OpenRouter, Anthropic, OpenAI,
 * Google, Groq, xAI, Mistral, Together AI, DeepSeek, Cohere, Hugging Face,
 * Ollama and the Codex CLI model list.
 */

export interface ModelPricing {
  /** USD per 1M tokens. */
  input: number | null;
  output: number | null;
  cachedInput: number | null;
}

export type ModelCapability =
  | "vision"
  | "audio"
  | "video"
  | "tools"
  | "reasoning"
  | "structured"
  | "caching"
  | "pdf";

export interface ModelDetails {
  creator: string | null;
  description: string | null;
  /** Epoch ms of the model's release/creation, when the provider reports one. */
  releasedAt: number | null;
  contextLength: number | null;
  maxOutputTokens: number | null;
  pricing: ModelPricing | null;
  isFree: boolean;
  capabilities: ModelCapability[];
  /** Ollama-only extras — the local weights people actually care about. */
  parameterSize: string | null;
  quantization: string | null;
  fileSizeBytes: number | null;
}

const CAPABILITY_ORDER: ModelCapability[] = [
  "reasoning",
  "tools",
  "vision",
  "audio",
  "video",
  "pdf",
  "structured",
  "caching",
];

export function getModelDetails(
  metadata: Record<string, unknown> | null | undefined,
  providerModelId: string,
  fallbackCreator?: string | null,
): ModelDetails {
  const raw = isRecord(metadata) ? metadata : {};
  const pricing = readPricing(raw);

  return {
    creator: readCreator(raw, providerModelId) ?? normalizeCreator(fallbackCreator),
    description: readString(raw["description"]),
    releasedAt: readReleasedAt(raw),
    contextLength: readContextLength(raw),
    maxOutputTokens: readMaxOutputTokens(raw),
    pricing,
    isFree: readIsFree(raw, providerModelId, pricing),
    capabilities: getModelCapabilities(raw),
    parameterSize: readString(readRecord(raw["details"])?.["parameter_size"]),
    quantization: readString(readRecord(raw["details"])?.["quantization_level"]),
    fileSizeBytes: readNumber(raw["size"]),
  };
}

/* ---------------------------------------------------------------- creator */

function readCreator(raw: Record<string, unknown>, providerModelId: string): string | null {
  // OpenRouter / Hugging Face ids are "<author>/<model>"; "~" marks a variant.
  const [namespace] = providerModelId.replace(/^~/, "").split("/");
  if (namespace && namespace !== providerModelId) {
    return normalizeCreator(namespace);
  }

  return (
    // "system" is OpenAI's placeholder owner and names nobody.
    normalizeCreator(readString(raw["owned_by"])) ??
    normalizeCreator(readString(raw["organization"])) ??
    // Ollama has no owner field, but `details.family` identifies the lineage.
    normalizeCreator(readString(readRecord(raw["details"])?.["family"]))
  );
}

function normalizeCreator(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== "system" ? trimmed : null;
}

/* ------------------------------------------------------------------ dates */

function readReleasedAt(raw: Record<string, unknown>): number | null {
  // Unix seconds: OpenRouter, OpenAI, Groq, xAI, Mistral, Together, HF.
  const created = readNumber(raw["created"]);
  if (created !== null && created > 0) {
    // A few providers hand back milliseconds; anything past year ~5138 is ms.
    return created > 1e11 ? created : created * 1000;
  }

  // ISO strings: Anthropic (`created_at`), Ollama (`modified_at`).
  return readTimestamp(raw["created_at"]) ?? readTimestamp(raw["modified_at"]);
}

function readTimestamp(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

/* ----------------------------------------------------------------- limits */

function readContextLength(raw: Record<string, unknown>): number | null {
  return (
    readPositive(raw["context_length"]) ??
    readPositive(readRecord(raw["top_provider"])?.["context_length"]) ??
    readPositive(raw["context_window"]) ?? // Groq, Codex
    readPositive(raw["max_context_length"]) ?? // Mistral
    readPositive(raw["max_input_tokens"]) ?? // Anthropic
    readPositive(raw["inputTokenLimit"]) ?? // Google
    // Hugging Face reports context per serving provider; show the best on offer.
    maxOfProviders(raw, "context_length")
  );
}

function readMaxOutputTokens(raw: Record<string, unknown>): number | null {
  return (
    readPositive(readRecord(raw["top_provider"])?.["max_completion_tokens"]) ??
    readPositive(raw["max_completion_tokens"]) ?? // Groq
    readPositive(raw["max_tokens"]) ?? // Anthropic
    readPositive(raw["outputTokenLimit"]) // Google
  );
}

/* ---------------------------------------------------------------- pricing */

function readPricing(raw: Record<string, unknown>): ModelPricing | null {
  const pricing = readRecord(raw["pricing"]);

  if (pricing && ("prompt" in pricing || "completion" in pricing)) {
    // OpenRouter quotes USD per single token, as decimal strings.
    return buildPricing(
      scale(readNumber(pricing["prompt"]), 1e6),
      scale(readNumber(pricing["completion"]), 1e6),
      scale(readNumber(pricing["input_cache_read"]), 1e6),
    );
  }

  if (pricing) {
    // Together AI and Hugging Face already quote USD per 1M tokens.
    return buildPricing(
      readNumber(pricing["input"]),
      readNumber(pricing["output"]),
      readNumber(pricing["cached_input"]),
    );
  }

  if ("prompt_text_token_price" in raw || "completion_text_token_price" in raw) {
    // xAI quotes USD cents per 100M tokens.
    return buildPricing(
      scale(readNumber(raw["prompt_text_token_price"]), 1 / 1e4),
      scale(readNumber(raw["completion_text_token_price"]), 1 / 1e4),
      scale(readNumber(raw["cached_prompt_text_token_price"]), 1 / 1e4),
    );
  }

  const providerPricing = readRecord(firstLiveProvider(raw)?.["pricing"]);
  if (providerPricing) {
    return buildPricing(
      readNumber(providerPricing["input"]),
      readNumber(providerPricing["output"]),
      readNumber(providerPricing["cached_input"]),
    );
  }

  return null;
}

function buildPricing(
  input: number | null,
  output: number | null,
  cachedInput: number | null,
): ModelPricing | null {
  if (input === null && output === null) {
    return null;
  }

  return { input, output, cachedInput };
}

/** Per-token prices are tiny decimals; rounding keeps float noise out of the UI. */
function scale(value: number | null, factor: number): number | null {
  return value === null ? null : Math.round(value * factor * 1e6) / 1e6;
}

function readIsFree(
  raw: Record<string, unknown>,
  providerModelId: string,
  pricing: ModelPricing | null,
): boolean {
  if (providerModelId.endsWith(":free")) {
    return true;
  }

  if (firstLiveProvider(raw)?.["is_free"] === true) {
    return true;
  }

  return pricing !== null && (pricing.input ?? 0) === 0 && (pricing.output ?? 0) === 0;
}

/* ----------------------------------------------------------- capabilities */

export function getModelCapabilities(
  metadata: Record<string, unknown> | null | undefined,
): ModelCapability[] {
  const raw = isRecord(metadata) ? metadata : {};
  const found = new Set<ModelCapability>();

  for (const modality of readModalities(raw)) {
    if (modality.includes("image")) found.add("vision");
    if (modality.includes("audio")) found.add("audio");
    if (modality.includes("video")) found.add("video");
    if (modality.includes("pdf")) found.add("pdf");
  }

  // OpenRouter advertises everything it accepts as a request parameter.
  const parameters = readStringArray(raw["supported_parameters"]);
  if (parameters.includes("tools") || parameters.includes("tool_choice")) found.add("tools");
  if (parameters.includes("reasoning") || parameters.includes("include_reasoning")) {
    found.add("reasoning");
  }
  if (parameters.includes("structured_outputs") || parameters.includes("response_format")) {
    found.add("structured");
  }

  // Anthropic (nested `{ supported: boolean }`) and Mistral (flat booleans).
  const capabilities = readRecord(raw["capabilities"]);
  if (capabilities) {
    if (isSupported(capabilities["image_input"]) || isSupported(capabilities["vision"])) {
      found.add("vision");
    }
    if (isSupported(capabilities["pdf_input"])) found.add("pdf");
    if (isSupported(capabilities["thinking"]) || isSupported(capabilities["effort"])) {
      found.add("reasoning");
    }
    if (isSupported(capabilities["structured_outputs"])) found.add("structured");
    if (isSupported(capabilities["function_calling"])) found.add("tools");
  }

  // Ollama /api/show and Cohere both expose a flat capability/feature list.
  for (const flag of [
    ...readStringArray(raw["capabilities"]),
    ...readStringArray(raw["features"]),
  ]) {
    const normalized = flag.toLowerCase();
    if (normalized.includes("vision")) found.add("vision");
    if (normalized.includes("tool") || normalized.includes("function")) found.add("tools");
    if (normalized.includes("thinking") || normalized.includes("reasoning")) found.add("reasoning");
    if (normalized.includes("json") || normalized.includes("structured")) found.add("structured");
  }

  if (raw["thinking"] === true) found.add("reasoning"); // Google
  if (asArray(raw["supported_reasoning_levels"]).length > 0) found.add("reasoning"); // Codex
  if (readNumber(readRecord(raw["pricing"])?.["input_cache_read"]) !== null) found.add("caching");

  const liveProvider = firstLiveProvider(raw); // Hugging Face
  if (liveProvider?.["supports_tools"] === true) found.add("tools");
  if (liveProvider?.["supports_structured_output"] === true) found.add("structured");

  return CAPABILITY_ORDER.filter((capability) => found.has(capability));
}

function readModalities(raw: Record<string, unknown>): string[] {
  const architecture = readRecord(raw["architecture"]);

  return [
    ...readStringArray(raw["input_modalities"]), // xAI, Codex
    ...readStringArray(architecture?.["input_modalities"]), // OpenRouter, Hugging Face
    ...readStringArray(architecture?.["output_modalities"]),
    readString(architecture?.["modality"]) ?? "",
  ].map((value) => value.toLowerCase());
}

function isSupported(value: unknown): boolean {
  return value === true || readRecord(value)?.["supported"] === true;
}

/* ------------------------------------------------------------------ utils */

/** Hugging Face lists one entry per serving provider; the first live one wins. */
function firstLiveProvider(raw: Record<string, unknown>): Record<string, unknown> | null {
  const entries = asArray(raw["providers"]).filter(isRecord);
  return entries.find((entry) => entry["status"] === "live") ?? entries[0] ?? null;
}

function maxOfProviders(raw: Record<string, unknown>, key: string): number | null {
  const values = asArray(raw["providers"])
    .filter(isRecord)
    .map((entry) => readPositive(entry[key]))
    .filter((value): value is number => value !== null);

  return values.length > 0 ? Math.max(...values) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

/** Providers quote numbers inconsistently — OpenRouter's prices are strings. */
function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readPositive(value: unknown): number | null {
  const parsed = readNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}
