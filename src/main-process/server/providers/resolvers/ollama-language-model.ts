import { createOllama } from "ai-sdk-ollama";
import type { ProviderHostPortConfigValue } from "@shared/providers/catalog";
import { buildOllamaBaseUrl } from "../../../providers/ollama-base-url";
import type { LanguageModelResolver } from "../language-model-types";

export const createOllamaLanguageModel: LanguageModelResolver = ({
  providerRuntime,
  providerModelId,
}) => {
  const endpoint = readRequiredEndpointConfig(providerRuntime.parsedConfig.endpoint);
  const ollama = createOllama({
    baseURL: buildOllamaBaseUrl(endpoint),
  });

  return ollama(providerModelId);
};

function readRequiredEndpointConfig(value: unknown): ProviderHostPortConfigValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('Missing required runtime config field "endpoint" for provider "ollama".');
  }

  const host = (value as { host?: unknown }).host;
  const port = (value as { port?: unknown }).port;

  if (
    typeof host !== "string" ||
    !host.trim() ||
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error('Invalid runtime config field "endpoint" for provider "ollama".');
  }

  return { host: host.trim(), port };
}
