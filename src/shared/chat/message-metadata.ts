import type { LanguageModelUsage, UIMessage } from "ai";
import { type } from "arktype";
import type { TiptapDocument } from "../tiptap/document";

export interface ChatMessageMetadata {
  parentId: string | null;
  pinned?: boolean;
  usage?: LanguageModelUsage;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
    cached?: number;
    cacheWrite?: number;
    reasoning?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    total?: number;
    currency: string;
  };
  times?: {
    generation?: number;
  };
  provider?: string;
  model?: string;
  finishReason?: string;
  createdAt?: number;
  updatedAt?: number;
  siblings?: string[];
  siblingIndex?: number;
}

export type HanokiUiMessage = UIMessage<ChatMessageMetadata, { tiptap: TiptapDocument }>;

export const chatMessageMetadataSchema = type({
  parentId: "string|null",
  "pinned?": "boolean",
  "usage?": {
    inputTokens: "number|undefined",
    inputTokenDetails: {
      noCacheTokens: "number|undefined",
      cacheReadTokens: "number|undefined",
      cacheWriteTokens: "number|undefined",
    },
    outputTokens: "number|undefined",
    outputTokenDetails: {
      textTokens: "number|undefined",
      reasoningTokens: "number|undefined",
    },
    totalTokens: "number|undefined",
    "reasoningTokens?": "number|undefined",
    "cachedInputTokens?": "number|undefined",
  },
  "tokens?": {
    "input?": "number",
    "output?": "number",
    "total?": "number",
    "cached?": "number",
    "cacheWrite?": "number",
    "reasoning?": "number",
  },
  "cost?": {
    "input?": "number",
    "output?": "number",
    "total?": "number",
    currency: "string",
  },
  "times?": {
    "generation?": "number",
  },
  "provider?": "string",
  "model?": "string",
  "finishReason?": "string",
  "createdAt?": "number",
  "updatedAt?": "number",
  "siblings?": "string[]",
  "siblingIndex?": "number",
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
