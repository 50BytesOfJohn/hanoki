import type { ComponentType } from "react";
import type { ProviderId } from "@shared/providers/catalog";
import { OllamaIcon } from "./ollama-icon";
import { OpenRouterIcon } from "./openrouter-icon";
import { createRemoteProviderIcon, type ProviderIconProps } from "./remote-provider-icon";

export type ProviderIconComponent = ComponentType<ProviderIconProps>;

const OpenAiIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/openai.svg",
  darkUrl: "https://svgl.app/library/openai_dark.svg",
  alt: "OpenAI",
});

const AnthropicIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/anthropic_black.svg",
  darkUrl: "https://svgl.app/library/anthropic_white.svg",
  alt: "Anthropic",
});

const GoogleIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/google.svg",
  alt: "Google",
});

const GroqIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/groq.svg",
  alt: "Groq",
});

const XAiIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/xai_light.svg",
  darkUrl: "https://svgl.app/library/xai_dark.svg",
  alt: "xAI",
});

const MistralIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/mistral-ai_logo.svg",
  alt: "Mistral",
});

const TogetherAiIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/togetherai_light.svg",
  darkUrl: "https://svgl.app/library/togetherai_dark.svg",
  alt: "Together AI",
});

const DeepSeekIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/deepseek.svg",
  alt: "DeepSeek",
});

const CohereIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/cohere.svg",
  alt: "Cohere",
});

const HuggingFaceIcon = createRemoteProviderIcon({
  lightUrl: "https://svgl.app/library/hugging_face.svg",
  alt: "Hugging Face",
});

export const providerIconsById = {
  anthropic: AnthropicIcon,
  cohere: CohereIcon,
  deepseek: DeepSeekIcon,
  google: GoogleIcon,
  groq: GroqIcon,
  huggingface: HuggingFaceIcon,
  mistral: MistralIcon,
  ollama: OllamaIcon,
  openai: OpenAiIcon,
  openrouter: OpenRouterIcon,
  togetherai: TogetherAiIcon,
  xai: XAiIcon,
} satisfies Record<ProviderId, ProviderIconComponent>;

export function getProviderIconById(providerId: ProviderId): ProviderIconComponent {
  return providerIconsById[providerId];
}
