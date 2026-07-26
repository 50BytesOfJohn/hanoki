import type { LanguageModel } from "ai";
import type { ProviderId } from "@shared/providers/catalog";
import type { SyncProviderModelInput } from "../../models/repository";

type ActiveModelLifecycleStatus = SyncProviderModelInput["lifecycleStatus"];
export type ApiKeyProviderId = Exclude<ProviderId, "ollama">;

export interface ProviderRequestSpec {
  url: string;
  init: RequestInit;
  timeoutMs?: number;
}

interface SdkProviderRegistryEntry {
  createLanguageModel: (apiKey: string, providerModelId: string) => Promise<LanguageModel>;
  buildModelsRequest: (apiKey: string) => ProviderRequestSpec;
  parseModels: (body: unknown) => SyncProviderModelInput[];
}

export const sdkProviderRegistry = {
  openrouter: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      return createOpenRouter({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://openrouter.ai/api/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList(
        "openrouter",
        extractArrayFromResponse(body, ["data"], "OpenRouter"),
        {
          getLifecycleStatus(rawModel) {
            return hasTruthyFlag(rawModel, "deprecated") || hasTruthyFlag(rawModel, "archived")
              ? "deprecated"
              : "active";
          },
        },
      );
    },
  },
  openai: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://api.openai.com/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList("openai", extractArrayFromResponse(body, ["data"], "OpenAI"));
    },
  },
  anthropic: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return {
        url: "https://api.anthropic.com/v1/models",
        init: {
          method: "GET",
          headers: {
            Accept: "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": apiKey,
          },
        },
      };
    },
    parseModels(body) {
      return normalizeModelList(
        "anthropic",
        extractArrayFromResponse(body, ["data"], "Anthropic"),
        {
          getDisplayName(rawModel, providerModelId) {
            return (
              readTrimmedString(rawModel.name) ??
              readTrimmedString(rawModel.display_name) ??
              providerModelId
            );
          },
        },
      );
    },
  },
  google: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createGoogle } = await import("@ai-sdk/google");
      return createGoogle({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models",
        init: {
          method: "GET",
          headers: {
            Accept: "application/json",
            "x-goog-api-key": apiKey,
          },
        },
      };
    },
    parseModels(body) {
      return normalizeModelList(
        "google",
        extractArrayFromResponse(body, ["models"], "Google Generative AI"),
        {
          getProviderModelId(rawModel) {
            const rawName = readTrimmedString(rawModel.name);
            if (!rawName) {
              return null;
            }

            return rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName;
          },
          getDisplayName(rawModel, providerModelId) {
            return readTrimmedString(rawModel.displayName) ?? providerModelId;
          },
          include(rawModel) {
            const supportedGenerationMethods = readStringArray(rawModel.supportedGenerationMethods);
            return (
              supportedGenerationMethods.length === 0 ||
              supportedGenerationMethods.includes("generateContent")
            );
          },
        },
      );
    },
  },
  groq: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createGroq } = await import("@ai-sdk/groq");
      return createGroq({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://api.groq.com/openai/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList("groq", extractArrayFromResponse(body, ["data"], "Groq"));
    },
  },
  xai: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createXai } = await import("@ai-sdk/xai");
      return createXai({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://api.x.ai/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList("xai", extractArrayFromResponse(body, ["data"], "xAI"));
    },
  },
  mistral: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://api.mistral.ai/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList("mistral", extractArrayFromResponse(body, ["data"], "Mistral"), {
        getLifecycleStatus(rawModel) {
          return hasTruthyFlag(rawModel, "archived") ? "deprecated" : "active";
        },
      });
    },
  },
  togetherai: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createTogetherAI } = await import("@ai-sdk/togetherai");
      return createTogetherAI({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://api.together.xyz/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList(
        "togetherai",
        extractArrayFromResponse(body, ["data"], "Together AI"),
      );
    },
  },
  deepseek: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createDeepSeek } = await import("@ai-sdk/deepseek");
      return createDeepSeek({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://api.deepseek.com/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList("deepseek", extractArrayFromResponse(body, ["data"], "DeepSeek"));
    },
  },
  cohere: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createCohere } = await import("@ai-sdk/cohere");
      return createCohere({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest(
        "https://api.cohere.com/v1/models?page_size=1000&endpoint=chat",
        apiKey,
      );
    },
    parseModels(body) {
      return normalizeModelList("cohere", extractArrayFromResponse(body, ["models"], "Cohere"), {
        getProviderModelId(rawModel) {
          return readTrimmedString(rawModel.name);
        },
        getDisplayName(rawModel, providerModelId) {
          return providerModelId;
        },
        getLifecycleStatus(rawModel) {
          return hasTruthyFlag(rawModel, "is_deprecated") ? "deprecated" : "active";
        },
      });
    },
  },
  huggingface: {
    async createLanguageModel(apiKey, providerModelId) {
      const { createHuggingFace } = await import("@ai-sdk/huggingface");
      return createHuggingFace({ apiKey })(providerModelId);
    },
    buildModelsRequest(apiKey) {
      return buildBearerRequest("https://router.huggingface.co/v1/models", apiKey);
    },
    parseModels(body) {
      return normalizeModelList(
        "huggingface",
        extractArrayFromResponse(body, ["data"], "Hugging Face"),
      );
    },
  },
} satisfies Record<ApiKeyProviderId, SdkProviderRegistryEntry>;

export function getSdkProviderRegistryEntry(
  providerId: ProviderId,
): SdkProviderRegistryEntry | null {
  if (providerId === "ollama") {
    return null;
  }

  return sdkProviderRegistry[providerId];
}

function buildBearerRequest(url: string, apiKey: string): ProviderRequestSpec {
  return {
    url,
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  };
}

function extractArrayFromResponse(
  body: unknown,
  keys: readonly string[],
  providerName: string,
): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }

  if (body && typeof body === "object") {
    for (const key of keys) {
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  throw new Error(`${providerName} model response does not contain a supported model list.`);
}

function normalizeModelList(
  providerId: ProviderId,
  rawModels: unknown[],
  options?: {
    getProviderModelId?: (rawModel: Record<string, unknown>) => string | null;
    getDisplayName?: (rawModel: Record<string, unknown>, providerModelId: string) => string | null;
    getLifecycleStatus?: (rawModel: Record<string, unknown>) => ActiveModelLifecycleStatus;
    include?: (rawModel: Record<string, unknown>, providerModelId: string) => boolean;
  },
): SyncProviderModelInput[] {
  const seenProviderModelIds = new Set<string>();
  const normalized: SyncProviderModelInput[] = [];

  for (const rawEntry of rawModels) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      continue;
    }

    const rawModel = rawEntry as Record<string, unknown>;
    const providerModelId =
      options?.getProviderModelId?.(rawModel) ?? readTrimmedString(rawModel.id);
    if (!providerModelId || seenProviderModelIds.has(providerModelId)) {
      continue;
    }

    if (options?.include && !options.include(rawModel, providerModelId)) {
      continue;
    }

    seenProviderModelIds.add(providerModelId);

    normalized.push({
      providerModelId,
      canonicalModelId: "unknown",
      displayName:
        options?.getDisplayName?.(rawModel, providerModelId) ??
        readTrimmedString(rawModel.name) ??
        providerModelId,
      metadata: rawModel,
      lifecycleStatus: options?.getLifecycleStatus?.(rawModel) ?? "active",
    });
  }

  if (normalized.length === 0) {
    throw new Error(`No models were returned for provider "${providerId}".`);
  }

  return normalized;
}

function hasTruthyFlag(rawModel: Record<string, unknown>, key: string): boolean {
  return rawModel[key] === true;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readTrimmedString(item))
    .filter((item): item is string => item !== null);
}
