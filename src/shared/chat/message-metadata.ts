import type { UIMessage } from "ai";
import { type } from "arktype";

export interface ChatMessageMetadata {
  parentId: string | null;
  pinned?: boolean;
  tokens?: {
    input?: number;
    output?: number;
    cached?: number;
  };
  times?: {
    generation?: number;
  };
  provider?: string;
  model?: string;
  siblings?: string[];
  siblingIndex?: number;
}

export type HanokiUiMessage = UIMessage<ChatMessageMetadata>;

export const chatMessageMetadataSchema = type({
  parentId: "string|null",
});

type ParseChatMessageMetadataResult =
  | {
      ok: true;
      value: ChatMessageMetadata;
    }
  | {
      ok: false;
      error: string;
    };

export function parseChatMessageMetadata(input: unknown): ParseChatMessageMetadataResult {
  const parsed = chatMessageMetadataSchema(input);

  if (parsed instanceof type.errors) {
    return {
      ok: false,
      error: parsed[0]?.message ?? "Chat message metadata is invalid.",
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}

export function normalizeChatMessageMetadata(
  input: unknown,
  fallbackParentId: string | null = null,
): ChatMessageMetadata {
  const parsed = parseChatMessageMetadata(input);
  if (!parsed.ok) {
    return { parentId: fallbackParentId };
  }

  return parsed.value;
}
