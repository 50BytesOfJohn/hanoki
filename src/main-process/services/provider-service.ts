/**
 * Provider credential tests are implemented per provider method on purpose.
 * Each provider function should own its endpoint URL, timeout, request shape,
 * and response/status interpretation so adding new providers does not create
 * shared abstractions that leak provider-specific behavior.
 */
import type {
  ProviderInfo,
  ProviderCredentialTestInput,
  ProviderCredentialTestResult,
  ProviderModelInfo,
  SaveProviderInput,
  SaveProviderResult,
} from "@shared/ipc";
import type {
  ProviderModelSyncStatus,
  ProvidersStartupModelSyncCompletedEvent,
} from "@shared/events";
import {
  getSupportedProviderById,
  type ProviderHostPortConfigValue,
  type ProviderId,
  type SupportedProviderDefinition,
} from "@shared/providers/catalog";
import { createUuidV7 } from "../db/uuidv7";
import {
  listModelsByProviderId,
  syncProviderModels,
  type ProviderModelSyncContext,
  type SyncProviderModelInput,
} from "../models/repository";
import { buildOllamaBaseUrl } from "../providers/ollama-base-url";
import {
  createProvider,
  deleteProvider as deleteStoredProvider,
  getProviderById,
  listProviders as listStoredProviders,
  updateProviderMetadataModelSync,
  updateProviderModelsSyncStatus,
  type ProviderTableRow,
} from "../providers/repository";
import {
  resolveProviderRuntimeContext,
  type ParsedProviderRuntimeConfig,
} from "../providers/runtime-config";
import { AppError } from "../ipc/core/errors";
import {
  getSdkProviderRegistryEntry,
  type ProviderRequestSpec,
} from "../server/providers/sdk-provider-registry";
import { encryptString, isEncryptionAvailable } from "./safe-storage";

export interface ProviderService {
  listProviders(): ProviderInfo[];
  listProviderModels(providerId: string): ProviderModelInfo[];
  testCredentials(input: ProviderCredentialTestInput): Promise<ProviderCredentialTestResult>;
  saveProvider(input: SaveProviderInput): SaveProviderResult;
  deleteProvider(providerId: string): void;
  syncProvidersOnStartup(): Promise<void>;
}

interface ProviderModelSyncCompletedPayload {
  providerId: string;
  status: ProviderModelSyncStatus;
}

interface ProvidersStartupModelSyncCompletedPayload extends Omit<
  ProvidersStartupModelSyncCompletedEvent,
  "type"
> {}

interface ProviderServiceOptions {
  onModelSyncCompleted?: (payload: ProviderModelSyncCompletedPayload) => void;
  onStartupSyncCompleted?: (payload: ProvidersStartupModelSyncCompletedPayload) => void;
}

export function createProviderService(options?: ProviderServiceOptions): ProviderService {
  const inFlightModelSyncProviderIds = new Set<string>();

  return {
    listProviders() {
      return listStoredProviders().map((row) => ({
        id: row.id,
        displayName: row.displayName,
        catalogId: row.catalogId as ProviderId,
      }));
    },

    listProviderModels(providerId) {
      return listModelsByProviderId(providerId).map((row) => ({
        id: row.id,
        providerId: row.providerId,
        providerModelId: row.providerModelId,
        displayName: row.displayName,
        isEnabled: row.isEnabled,
        status: row.lifecycleStatus as ProviderModelInfo["status"],
      }));
    },

    async testCredentials(input) {
      const provider = getSupportedProviderById(input.providerId);
      if (!provider || !provider.isAvailable) {
        throw AppError.notFound(`Provider "${input.providerId}" is not available.`);
      }

      if (!provider.supportsCredentialTest) {
        throw AppError.badRequest(
          `Provider "${input.providerId}" does not support credential testing.`,
        );
      }

      const config = parseProviderDraftConfig(provider, input.config);

      if (input.providerId === "ollama") {
        return testOllamaCredentials(getRequiredDraftHostPortConfigValue(config, "endpoint"));
      }

      if (input.providerId === "openrouter") {
        return testOpenRouterCredentials(getRequiredDraftSecretConfigValue(config, "apiKey"));
      }

      const providerEntry = getSdkProviderRegistryEntry(input.providerId);
      if (!providerEntry) {
        throw AppError.badRequest(
          `Provider "${input.providerId}" does not support credential testing.`,
        );
      }

      return testSdkProviderCredentials(
        provider,
        providerEntry.buildModelsRequest(getRequiredDraftSecretConfigValue(config, "apiKey")),
      );
    },

    saveProvider(input) {
      const catalogEntry = getSupportedProviderById(input.catalogId);
      if (!catalogEntry || !catalogEntry.isAvailable) {
        throw AppError.notFound(`Provider "${input.catalogId}" is not available.`);
      }

      const config = parseProviderDraftConfig(catalogEntry, input.config);

      if (!isEncryptionAvailable()) {
        throw AppError.internal("Encryption is not available. Cannot securely store credentials.");
      }
      const id = createUuidV7();
      const displayName = input.displayName?.trim() || catalogEntry.name;

      const row = createProvider({
        id,
        displayName,
        catalogId: input.catalogId,
        config: buildStoredProviderConfig(catalogEntry, config),
      });

      void syncProviderModelsInBackground(row.id, "provider-added");

      return {
        id: row.id,
        displayName: row.displayName,
        catalogId: row.catalogId as ProviderId,
      };
    },

    deleteProvider(providerId) {
      const existing = getProviderById(providerId);
      if (!existing) {
        throw AppError.notFound(`Provider "${providerId}" not found.`);
      }

      deleteStoredProvider(providerId);
    },

    async syncProvidersOnStartup() {
      const providerRows = listStoredProviders();
      const results = await Promise.all(
        providerRows.map((providerRow) =>
          syncProviderModelsInBackground(providerRow.id, "startup"),
        ),
      );

      let succeededProviders = 0;
      let failedProviders = 0;

      for (const result of results) {
        if (result === "succeeded") {
          succeededProviders += 1;
          continue;
        }

        if (result === "failed") {
          failedProviders += 1;
        }
      }

      emitStartupSyncCompleted(options?.onStartupSyncCompleted, {
        totalProviders: providerRows.length,
        succeededProviders,
        failedProviders,
      });
    },
  };

  async function syncProviderModelsInBackground(
    providerId: string,
    syncContext: ProviderModelSyncContext,
  ): Promise<ProviderModelSyncStatus | null> {
    if (inFlightModelSyncProviderIds.has(providerId)) {
      return null;
    }

    inFlightModelSyncProviderIds.add(providerId);
    try {
      return await runProviderModelSync(providerId, syncContext, options?.onModelSyncCompleted);
    } catch (error) {
      console.error(`Provider model sync crashed for provider "${providerId}".`, error);
      return "failed";
    } finally {
      inFlightModelSyncProviderIds.delete(providerId);
    }
  }
}

type ProviderDraftConfigValue = string | ProviderHostPortConfigValue;
type ProviderDraftConfig = Record<string, ProviderDraftConfigValue>;

interface StoredSecretConfigValue {
  $secret: string;
}

function parseProviderDraftConfig(
  provider: SupportedProviderDefinition,
  rawConfig: Record<string, unknown>,
): ProviderDraftConfig {
  const config = rawConfig;
  const allowedKeys = new Set(Object.keys(provider.configFields));

  for (const key of Object.keys(config)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported config field "${key}" for provider "${provider.id}".`);
    }
  }

  const draft: ProviderDraftConfig = {};

  for (const [key, field] of Object.entries(provider.configFields)) {
    switch (field.type) {
      case "secret": {
        const rawValue = config[key];

        if (rawValue == null || rawValue === "") {
          if (field.required) {
            throw AppError.badRequest(`${field.label} is required.`);
          }
          continue;
        }

        if (typeof rawValue !== "string") {
          throw AppError.badRequest(`${field.label} must be a string.`);
        }

        const value = rawValue.trim();
        if (!value) {
          if (field.required) {
            throw AppError.badRequest(`${field.label} is required.`);
          }
          continue;
        }

        draft[key] = value;
        break;
      }
      case "host+port": {
        const parsed = parseDraftHostPortConfigValue(config[key], field.label, field.required);
        if (!parsed) {
          continue;
        }

        draft[key] = parsed;
        break;
      }
    }
  }

  return draft;
}

function buildStoredProviderConfig(
  provider: SupportedProviderDefinition,
  draftConfig: ProviderDraftConfig,
): Record<string, unknown> {
  const storedConfig: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(provider.configFields)) {
    const value = draftConfig[key];
    if (value == null) {
      continue;
    }

    switch (field.type) {
      case "secret": {
        if (typeof value !== "string") {
          throw AppError.badRequest(`Expected string config value for "${key}".`);
        }

        const secretValue: StoredSecretConfigValue = {
          $secret: encryptString(value),
        };
        storedConfig[key] = secretValue;
        break;
      }
      case "host+port": {
        if (!isProviderHostPortConfigValue(value)) {
          throw AppError.badRequest(`Expected host+port config value for "${key}".`);
        }

        storedConfig[key] = value;
        break;
      }
    }
  }

  return storedConfig;
}

function parseDraftHostPortConfigValue(
  rawValue: unknown,
  fieldLabel: string,
  required?: boolean,
): ProviderHostPortConfigValue | null {
  if (rawValue == null || rawValue === "") {
    if (required) {
      throw AppError.badRequest(`${fieldLabel} is required.`);
    }
    return null;
  }

  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    throw AppError.badRequest(`${fieldLabel} must be an object with host and port.`);
  }

  const hostValue = (rawValue as { host?: unknown }).host;
  if (typeof hostValue !== "string" || !hostValue.trim()) {
    throw AppError.badRequest(`${fieldLabel} host is required.`);
  }

  const portValue = parsePortNumber((rawValue as { port?: unknown }).port);
  if (portValue === null) {
    throw AppError.badRequest(`${fieldLabel} port must be an integer between 1 and 65535.`);
  }

  return {
    host: hostValue.trim(),
    port: portValue,
  };
}

function isProviderHostPortConfigValue(value: unknown): value is ProviderHostPortConfigValue {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { host?: unknown }).host === "string" &&
    Number.isInteger((value as { port?: unknown }).port)
  );
}

function getRequiredDraftSecretConfigValue(config: ProviderDraftConfig, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || !value) {
    throw AppError.badRequest(`Missing required config field "${key}".`);
  }
  return value;
}

function getRequiredDraftHostPortConfigValue(
  config: ProviderDraftConfig,
  key: string,
): ProviderHostPortConfigValue {
  const value = config[key];
  if (!isProviderHostPortConfigValue(value) || value.port < 1 || value.port > 65_535) {
    throw AppError.badRequest(`Missing required config field "${key}".`);
  }

  return { host: value.host.trim(), port: value.port };
}

async function runProviderModelSync(
  providerId: string,
  syncContext: ProviderModelSyncContext,
  onModelSyncCompleted?: (payload: ProviderModelSyncCompletedPayload) => void,
): Promise<ProviderModelSyncStatus> {
  const providerRow = getProviderById(providerId);
  if (!providerRow) {
    return "failed";
  }

  const startedAt = Date.now();
  updateProviderModelsSyncStatus(providerId, "syncing");
  updateProviderMetadataModelSync(providerId, {
    error: null,
    started_at: startedAt,
    ended_at: null,
    duration: null,
  });

  try {
    const { providerDef, parsedConfig } = resolveProviderRuntimeContext(providerRow);
    const normalizedModels = await fetchModelsForProviderSync({
      providerRow,
      providerDef,
      parsedConfig,
    });

    syncProviderModels(providerId, normalizedModels, { context: syncContext });

    const endedAt = Date.now();
    updateProviderModelsSyncStatus(providerId, "succeeded");
    updateProviderMetadataModelSync(providerId, {
      error: null,
      ended_at: endedAt,
      duration: endedAt - startedAt,
    });

    emitModelSyncCompleted(onModelSyncCompleted, {
      providerId,
      status: "succeeded",
    });
    return "succeeded";
  } catch (error) {
    const endedAt = Date.now();
    updateProviderModelsSyncStatus(providerId, "failed");
    updateProviderMetadataModelSync(providerId, {
      error: formatModelSyncErrorMessage(error),
      ended_at: endedAt,
      duration: endedAt - startedAt,
    });

    console.error(`Provider model sync failed for provider "${providerId}".`, error);

    emitModelSyncCompleted(onModelSyncCompleted, {
      providerId,
      status: "failed",
    });
    return "failed";
  }
}

function emitModelSyncCompleted(
  handler: ((payload: ProviderModelSyncCompletedPayload) => void) | undefined,
  payload: ProviderModelSyncCompletedPayload,
): void {
  if (!handler) {
    return;
  }

  try {
    handler(payload);
  } catch (error) {
    console.error("Provider model sync completion callback failed.", error);
  }
}

function emitStartupSyncCompleted(
  handler: ((payload: ProvidersStartupModelSyncCompletedPayload) => void) | undefined,
  payload: ProvidersStartupModelSyncCompletedPayload,
): void {
  if (!handler) {
    return;
  }

  try {
    handler(payload);
  } catch (error) {
    console.error("Provider startup model sync completion callback failed.", error);
  }
}

interface ProviderModelSyncHandlerInput {
  providerRow: ProviderTableRow;
  providerDef: SupportedProviderDefinition;
  parsedConfig: ParsedProviderRuntimeConfig;
}

async function fetchModelsForProviderSync(
  input: ProviderModelSyncHandlerInput,
): Promise<SyncProviderModelInput[]> {
  if (input.providerDef.id === "ollama") {
    return fetchOllamaModelsForSync(input);
  }

  const providerEntry = getSdkProviderRegistryEntry(input.providerDef.id);
  if (!providerEntry) {
    throw new Error(`Provider "${input.providerDef.id}" does not support model sync.`);
  }

  return fetchSdkProviderModelsForSync(
    input.providerDef.id,
    providerEntry.buildModelsRequest(
      getRequiredParsedSecretConfigValue(input.parsedConfig, "apiKey"),
    ),
    providerEntry.parseModels,
  );
}

async function fetchOllamaModelsForSync({
  parsedConfig,
}: ProviderModelSyncHandlerInput): Promise<SyncProviderModelInput[]> {
  const endpointConfig = getRequiredParsedHostPortConfigValue(parsedConfig, "endpoint");
  const endpoint = `${buildOllamaBaseUrl(endpointConfig)}/api/tags`;
  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama model fetch failed with status ${response.status}.`);
    }

    const body = (await response.json()) as unknown;
    const models = extractOllamaModelsArray(body);
    const seenProviderModelIds = new Set<string>();
    const normalized: SyncProviderModelInput[] = [];

    for (const rawModel of models) {
      if (!rawModel || typeof rawModel !== "object" || Array.isArray(rawModel)) {
        continue;
      }

      const providerModelId = readTrimmedString((rawModel as Record<string, unknown>).name);
      if (!providerModelId || seenProviderModelIds.has(providerModelId)) {
        continue;
      }

      seenProviderModelIds.add(providerModelId);

      normalized.push({
        providerModelId,
        canonicalModelId: "unknown",
        displayName: providerModelId,
        metadata: rawModel as Record<string, unknown>,
        lifecycleStatus: "active",
      });
    }

    return normalized;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Ollama model fetch timed out.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractOllamaModelsArray(body: unknown): unknown[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Ollama model response must be an object.");
  }

  const models = (body as { models?: unknown }).models;
  if (!Array.isArray(models)) {
    throw new Error("Ollama model response is missing a models array.");
  }

  return models;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getRequiredParsedSecretConfigValue(
  config: ParsedProviderRuntimeConfig,
  key: string,
): string {
  const value = config[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required parsed config field "${key}".`);
  }
  return value;
}

function getRequiredParsedHostPortConfigValue(
  config: ParsedProviderRuntimeConfig,
  key: string,
): ProviderHostPortConfigValue {
  const value = config[key];
  if (
    !isProviderHostPortConfigValue(value) ||
    !value.host.trim() ||
    value.port < 1 ||
    value.port > 65_535
  ) {
    throw new Error(`Missing required parsed config field "${key}".`);
  }

  return { host: value.host.trim(), port: value.port };
}

function parsePortNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return null;
  }

  return parsed;
}

function formatModelSyncErrorMessage(error: unknown): string {
  const maxLength = 1000;
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  return message.length > maxLength ? `${message.slice(0, maxLength - 3)}...` : message;
}

async function testOpenRouterCredentials(apiKey: string): Promise<ProviderCredentialTestResult> {
  const endpoint = "https://openrouter.ai/api/v1/key";
  const timeoutMs = 10_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        providerId: "openrouter",
        ok: true,
        message: "OpenRouter API key is valid.",
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        providerId: "openrouter",
        ok: false,
        message: "OpenRouter rejected the API key.",
      };
    }

    return {
      providerId: "openrouter",
      ok: false,
      message: `OpenRouter credential test failed with status ${response.status}.`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        providerId: "openrouter",
        ok: false,
        message: "OpenRouter credential test timed out.",
      };
    }

    if (error instanceof Error) {
      return {
        providerId: "openrouter",
        ok: false,
        message: `OpenRouter credential test failed: ${error.message}`,
      };
    }

    return {
      providerId: "openrouter",
      ok: false,
      message: "OpenRouter credential test failed due to an unknown error.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testSdkProviderCredentials(
  provider: SupportedProviderDefinition,
  request: ProviderRequestSpec,
): Promise<ProviderCredentialTestResult> {
  try {
    const body = await fetchJsonWithTimeout(request);
    const providerEntry = getSdkProviderRegistryEntry(provider.id);
    providerEntry?.parseModels(body);

    return {
      providerId: provider.id,
      ok: true,
      message: `${provider.name} API key is valid.`,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        providerId: provider.id,
        ok: false,
        message: `${provider.name} credential test failed: ${error.message}`,
      };
    }

    return {
      providerId: provider.id,
      ok: false,
      message: `${provider.name} credential test failed due to an unknown error.`,
    };
  }
}

async function testOllamaCredentials(
  endpointConfig: ProviderHostPortConfigValue,
): Promise<ProviderCredentialTestResult> {
  const endpoint = `${buildOllamaBaseUrl(endpointConfig)}/api/tags`;
  const timeoutMs = 10_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        providerId: "ollama",
        ok: true,
        message: "Connected to Ollama successfully.",
      };
    }

    return {
      providerId: "ollama",
      ok: false,
      message: `Ollama credential test failed with status ${response.status}.`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        providerId: "ollama",
        ok: false,
        message: "Ollama credential test timed out.",
      };
    }

    if (error instanceof Error) {
      return {
        providerId: "ollama",
        ok: false,
        message: `Ollama credential test failed: ${error.message}`,
      };
    }

    return {
      providerId: "ollama",
      ok: false,
      message: "Ollama credential test failed due to an unknown error.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSdkProviderModelsForSync(
  providerId: Exclude<ProviderId, "ollama">,
  request: ProviderRequestSpec,
  parseModels: (body: unknown) => SyncProviderModelInput[],
): Promise<SyncProviderModelInput[]> {
  const body = await fetchJsonWithTimeout(request, `${getProviderName(providerId)} model fetch`);
  return parseModels(body);
}

async function fetchJsonWithTimeout(
  request: ProviderRequestSpec,
  operationName = "Provider request",
): Promise<unknown> {
  const timeoutMs = request.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${operationName} failed with status ${response.status}.`);
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${operationName} timed out.`, { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getProviderName(providerId: ProviderId): string {
  return getSupportedProviderById(providerId)?.name ?? providerId;
}
