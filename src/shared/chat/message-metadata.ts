import type { UIMessage } from "ai";
import { type } from "arktype";
import type { TiptapDocument } from "../tiptap/document";

export const chatMessageMetadataSchema = type({
  parentId: "string|null",
  "pinned?": "boolean",
  // Every field is optional: JSON serialization drops `undefined` values, so a
  // provider that reports no token counts sends `{ inputTokenDetails: {} }`.
  "usage?": {
    "inputTokens?": "number|undefined",
    "inputTokenDetails?": {
      "noCacheTokens?": "number|undefined",
      "cacheReadTokens?": "number|undefined",
      "cacheWriteTokens?": "number|undefined",
    },
    "outputTokens?": "number|undefined",
    "outputTokenDetails?": {
      "textTokens?": "number|undefined",
      "reasoningTokens?": "number|undefined",
    },
    "totalTokens?": "number|undefined",
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
  // Usage of the final model call only. `usage`/`tokens` sum every step of a
  // tool loop (right for billing), but each step re-sends the whole prompt, so
  // only the last step says how full the context window is.
  "contextUsage?": {
    "input?": "number",
    "output?": "number",
    "reasoning?": "number",
    "cached?": "number",
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
  // Set on a message regenerated with a note; links back to the message it
  // revised and snapshots that message's text so the revision can be shown,
  // retried, or resumed after the original is gone.
  "revision?": {
    sourceMessageId: "string",
    note: "string",
    sourceText: "string",
  },
});

export type ChatMessageMetadata = typeof chatMessageMetadataSchema.infer;

export type HanokiUiMessage = UIMessage<ChatMessageMetadata, { tiptap: TiptapDocument }>;

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
