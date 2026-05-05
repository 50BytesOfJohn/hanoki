import type { LanguageModelUsage } from "ai";
import type { ChatMessageMetadata } from "@shared/chat/message-metadata";

/**
 * Extract Ollama-specific metadata beyond what the AI SDK already provides.
 * Ollama token counts are surfaced via LanguageModelUsage by the ai-sdk-ollama adapter,
 * so no additional extraction is needed here.
 */
export function extractOllamaMetadata(
  _usage: LanguageModelUsage,
): Partial<Omit<ChatMessageMetadata, "parentId">> {
  return {};
}
