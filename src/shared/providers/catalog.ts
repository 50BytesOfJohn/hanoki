export type ProviderId =
  | "openrouter"
  | "openai"
  | "codex"
  | "anthropic"
  | "google"
  | "groq"
  | "xai"
  | "mistral"
  | "togetherai"
  | "deepseek"
  | "cohere"
  | "huggingface"
  | "ollama";

export interface ProviderHostPortConfigValue {
  host: string;
  port: number;
}

export interface ProviderConfigSecretFieldDefinition {
  type: "secret";
  required?: boolean;
  label: string;
  description?: string;
  placeholder?: string;
}

export interface ProviderConfigHostPortFieldDefinition {
  type: "host+port";
  required?: boolean;
  label: string;
  description?: string;
  defaultHost?: string;
  defaultPort?: number;
}

export type ProviderConfigFieldDefinition =
  | ProviderConfigSecretFieldDefinition
  | ProviderConfigHostPortFieldDefinition;

export interface SupportedProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  isAvailable: boolean;
  supportsCredentialTest: boolean;
  configFields: Record<string, ProviderConfigFieldDefinition>;
}

function createApiKeyProviderDefinition(
  id: Exclude<ProviderId, "ollama" | "codex">,
  name: string,
  description: string,
): SupportedProviderDefinition {
  return {
    id,
    name,
    description,
    isAvailable: true,
    supportsCredentialTest: true,
    configFields: {
      apiKey: {
        type: "secret",
        required: true,
        label: "API Key",
        description: `${name} API key`,
        placeholder: `Enter your ${name} API key`,
      },
    },
  };
}

export const SUPPORTED_PROVIDERS: readonly SupportedProviderDefinition[] = [
  createApiKeyProviderDefinition(
    "openrouter",
    "OpenRouter",
    "Use OpenRouter API keys to access models from multiple providers.",
  ),
  createApiKeyProviderDefinition("openai", "OpenAI", "Use OpenAI API keys to access GPT models."),
  createApiKeyProviderDefinition(
    "anthropic",
    "Anthropic",
    "Use Anthropic API keys to access Claude models.",
  ),
  createApiKeyProviderDefinition(
    "google",
    "Google",
    "Use Google AI Studio API keys to access Gemini models.",
  ),
  createApiKeyProviderDefinition("groq", "Groq", "Use Groq API keys to access Groq-hosted models."),
  createApiKeyProviderDefinition("xai", "xAI", "Use xAI API keys to access Grok models."),
  createApiKeyProviderDefinition(
    "mistral",
    "Mistral",
    "Use Mistral API keys to access Mistral models.",
  ),
  createApiKeyProviderDefinition(
    "togetherai",
    "Together AI",
    "Use Together AI API keys to access Together-hosted models.",
  ),
  createApiKeyProviderDefinition(
    "deepseek",
    "DeepSeek",
    "Use DeepSeek API keys to access DeepSeek chat models.",
  ),
  createApiKeyProviderDefinition(
    "cohere",
    "Cohere",
    "Use Cohere API keys to access Cohere chat models.",
  ),
  createApiKeyProviderDefinition(
    "huggingface",
    "Hugging Face",
    "Use Hugging Face API keys to access hosted chat models.",
  ),
  {
    id: "codex",
    name: "Codex (ChatGPT login)",
    description:
      "Reuse the Codex CLI sign-in on this device. Requests run against your ChatGPT plan limits and are limited to Codex coding models.",
    isAvailable: true,
    supportsCredentialTest: true,
    configFields: {},
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Use a local or remote Ollama server for model inference.",
    isAvailable: true,
    supportsCredentialTest: true,
    configFields: {
      endpoint: {
        type: "host+port",
        required: true,
        label: "Host and Port",
        description: "Connection details for your Ollama API server.",
        defaultHost: "127.0.0.1",
        defaultPort: 11434,
      },
    },
  },
] as const;

export function getSupportedProviderById(
  providerId: string,
): SupportedProviderDefinition | undefined {
  return SUPPORTED_PROVIDERS.find((provider) => provider.id === providerId);
}
