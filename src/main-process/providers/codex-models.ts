/**
 * Model catalog for the Codex (ChatGPT login) provider.
 *
 * The ChatGPT backend exposes the same model list the Codex CLI uses, including
 * the exact `instructions` each model expects. That endpoint is the only source
 * for those instructions: the backend rejects requests whose `instructions` do
 * not match ("Instructions are not valid"), so we always send back what it gave us.
 */
import type { CodexCredentials } from "./codex-auth";

export const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
/**
 * ponytail: sent as `client_version`; the backend requires it and hides models
 * newer than the reported version. Bump when new models fail to appear.
 */
const CODEX_CLIENT_VERSION = "0.146.1";
const CODEX_ORIGINATOR = "codex_cli_rs";
const MODELS_CACHE_TTL_MS = 30 * 60_000;
const MODELS_TIMEOUT_MS = 20_000;

export interface CodexModelDefinition {
  slug: string;
  displayName: string;
  description: string | null;
  instructions: string | null;
  defaultReasoningEffort: string | null;
  /** Raw backend entry minus the instruction blobs, safe to store as model metadata. */
  metadata: Record<string, unknown>;
}

interface CodexModelsCacheEntry {
  fetchedAtMs: number;
  models: CodexModelDefinition[];
}

const modelsCacheByAccountId = new Map<string, CodexModelsCacheEntry>();

export function buildCodexRequestHeaders(
  credentials: CodexCredentials,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    "chatgpt-account-id": credentials.accountId,
    originator: CODEX_ORIGINATOR,
    "User-Agent": `${CODEX_ORIGINATOR}/${CODEX_CLIENT_VERSION}`,
    Accept: "application/json",
    ...extraHeaders,
  };
}

export async function fetchCodexModels(
  credentials: CodexCredentials,
  options?: { forceRefresh?: boolean },
): Promise<CodexModelDefinition[]> {
  const cached = modelsCacheByAccountId.get(credentials.accountId);
  if (!options?.forceRefresh && cached && Date.now() - cached.fetchedAtMs < MODELS_CACHE_TTL_MS) {
    return cached.models;
  }

  const response = await fetch(
    `${CODEX_BASE_URL}/models?client_version=${encodeURIComponent(CODEX_CLIENT_VERSION)}`,
    {
      method: "GET",
      headers: buildCodexRequestHeaders(credentials),
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Codex model fetch failed with status ${response.status}.`);
  }

  const models = parseCodexModels(await response.json());
  modelsCacheByAccountId.set(credentials.accountId, { fetchedAtMs: Date.now(), models });

  return models;
}

export async function getCodexModel(
  credentials: CodexCredentials,
  slug: string,
): Promise<CodexModelDefinition> {
  const cachedMatch = (await fetchCodexModels(credentials)).find((model) => model.slug === slug);
  if (cachedMatch) {
    return cachedMatch;
  }

  // A model can appear between syncs; retry once against a fresh list.
  const match = (await fetchCodexModels(credentials, { forceRefresh: true })).find(
    (model) => model.slug === slug,
  );
  if (!match) {
    throw new Error(`Codex model "${slug}" is not available on this ChatGPT account.`);
  }

  return match;
}

export function parseCodexModels(body: unknown): CodexModelDefinition[] {
  const rawModels = (body as { models?: unknown } | null)?.models;
  if (!Array.isArray(rawModels)) {
    throw new Error("Codex model response does not contain a model list.");
  }

  const models: CodexModelDefinition[] = [];

  for (const rawModel of rawModels) {
    if (!rawModel || typeof rawModel !== "object" || Array.isArray(rawModel)) {
      continue;
    }

    const entry = rawModel as Record<string, unknown>;
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    // "hide" marks internal variants the Codex client keeps out of its picker.
    if (!slug || entry.visibility === "hide") {
      continue;
    }

    const { model_messages: modelMessages, ...metadata } = entry;
    const instructions = (modelMessages as { instructions_template?: unknown } | undefined)
      ?.instructions_template;

    models.push({
      slug,
      displayName: typeof entry.display_name === "string" ? entry.display_name : slug,
      description: typeof entry.description === "string" ? entry.description : null,
      instructions: typeof instructions === "string" && instructions ? instructions : null,
      defaultReasoningEffort:
        typeof entry.default_reasoning_level === "string" ? entry.default_reasoning_level : null,
      metadata,
    });
  }

  if (models.length === 0) {
    throw new Error("Codex returned no usable models for this ChatGPT account.");
  }

  return models;
}
