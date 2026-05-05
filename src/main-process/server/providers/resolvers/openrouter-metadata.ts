import type { LanguageModelUsage } from "ai";
import type { ChatMessageMetadata } from "@shared/chat/message-metadata";

/**
 * Extract OpenRouter-specific metadata beyond what the AI SDK already provides.
 * OpenRouter's usage (prompt/completion tokens) is fully captured via LanguageModelUsage,
 * so no additional extraction is needed here.
 */
export function extractOpenRouterMetadata(
  _usage: LanguageModelUsage,
): Partial<Omit<ChatMessageMetadata, "parentId">> {
  return {};
}
