import type { ComponentType } from "react";
import type { ProviderId } from "@shared/providers/catalog";
import anthropicBlack from "./assets/anthropic_black.svg?url";
import anthropicWhite from "./assets/anthropic_white.svg?url";
import cohere from "./assets/cohere.svg?url";
import deepseek from "./assets/deepseek.svg?url";
import google from "./assets/google.svg?url";
import groq from "./assets/groq.svg?url";
import huggingFace from "./assets/hugging_face.svg?url";
import mistral from "./assets/mistral-ai_logo.svg?url";
import openai from "./assets/openai.svg?url";
import openaiDark from "./assets/openai_dark.svg?url";
import togetherDark from "./assets/togetherai_dark.svg?url";
import togetherLight from "./assets/togetherai_light.svg?url";
import xaiDark from "./assets/xai_dark.svg?url";
import xaiLight from "./assets/xai_light.svg?url";
import { OllamaIcon } from "./ollama-icon";
import { OpenRouterIcon } from "./openrouter-icon";
import { createRemoteProviderIcon, type ProviderIconProps } from "./remote-provider-icon";

export type ProviderIconComponent = ComponentType<ProviderIconProps>;

const OpenAiIcon = createRemoteProviderIcon({
  lightUrl: openai,
  darkUrl: openaiDark,
  alt: "OpenAI",
});

const AnthropicIcon = createRemoteProviderIcon({
  lightUrl: anthropicBlack,
  darkUrl: anthropicWhite,
  alt: "Anthropic",
});

const GoogleIcon = createRemoteProviderIcon({
  lightUrl: google,
  alt: "Google",
});

const GroqIcon = createRemoteProviderIcon({
  lightUrl: groq,
  alt: "Groq",
});

const XAiIcon = createRemoteProviderIcon({
  lightUrl: xaiLight,
  darkUrl: xaiDark,
  alt: "xAI",
});

const MistralIcon = createRemoteProviderIcon({
  lightUrl: mistral,
  alt: "Mistral",
});

const TogetherAiIcon = createRemoteProviderIcon({
  lightUrl: togetherLight,
  darkUrl: togetherDark,
  alt: "Together AI",
});

const DeepSeekIcon = createRemoteProviderIcon({
  lightUrl: deepseek,
  alt: "DeepSeek",
});

const CohereIcon = createRemoteProviderIcon({
  lightUrl: cohere,
  alt: "Cohere",
});

const HuggingFaceIcon = createRemoteProviderIcon({
  lightUrl: huggingFace,
  alt: "Hugging Face",
});

export const providerIconsById = {
  anthropic: AnthropicIcon,
  codex: OpenAiIcon,
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
