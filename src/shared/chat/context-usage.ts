import type { ChatMessageMetadata, HanokiUiMessage } from "./message-metadata";

/**
 * How full the context window is, read from the latest response that reported
 * usage. A chat can hop between models and providers, so this is a measurement
 * of the last request rather than a tokenizer-exact count of the next one.
 */
export interface ContextUsage {
  messageId: string;
  /** Model row id that produced the measurement. */
  modelId: string | null;
  input: number;
  output: number;
  reasoning: number;
  cached: number | null;
  /**
   * Tokens the next request starts from: the prompt plus the reply, minus
   * reasoning, which is stripped before completed turns are replayed.
   */
  used: number;
  /** The response was stopped or failed, so its partial reply is not counted. */
  isPartial: boolean;
  /** Later responses reported no usage, so this measurement is older than them. */
  skippedResponses: number;
}

export type LatestContextUsage =
  | { status: "empty" }
  | { status: "unavailable"; modelId: string | null }
  | { status: "measured"; usage: ContextUsage };

/** Summed cost of the replies on the current branch; sibling branches are not included. */
export interface BranchCost {
  total: number;
  currency: string;
  /** Responses with no price, so `total` is a lower bound. */
  unpricedResponses: number;
}

export function getLatestContextUsage(messages: readonly HanokiUiMessage[]): LatestContextUsage {
  let skippedResponses = 0;
  let latestModelId: string | null | undefined;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || !isCompletedResponse(message)) {
      continue;
    }

    const metadata = message.metadata;
    latestModelId ??= metadata?.model ?? null;
    const counts = readContextCounts(message);

    if (!counts) {
      skippedResponses += 1;
      continue;
    }

    const reasoning = counts.reasoning ?? 0;
    const output = counts.output ?? 0;

    return {
      status: "measured",
      usage: {
        messageId: message.id,
        modelId: metadata?.model ?? null,
        input: counts.input,
        output,
        reasoning,
        cached: counts.cached ?? null,
        used: counts.input + Math.max(0, output - reasoning),
        isPartial: metadata?.finishReason === "abort" || metadata?.finishReason === "error",
        skippedResponses,
      },
    };
  }

  return latestModelId === undefined
    ? { status: "empty" }
    : { status: "unavailable", modelId: latestModelId };
}

export function getBranchCost(messages: readonly HanokiUiMessage[]): BranchCost | null {
  let total = 0;
  let currency: string | null = null;
  let unpricedResponses = 0;

  for (const message of messages) {
    if (!isCompletedResponse(message)) {
      continue;
    }

    const cost = message.metadata?.cost;
    if (typeof cost?.total !== "number") {
      unpricedResponses += 1;
      continue;
    }

    total += cost.total;
    currency ??= cost.currency;
  }

  return currency === null ? null : { total, currency, unpricedResponses };
}

/** A response still streaming has only its `start` metadata, with no timing yet. */
function isCompletedResponse(message: HanokiUiMessage): boolean {
  return (
    message.role === "assistant" &&
    (message.metadata?.times !== undefined || message.metadata?.finishReason !== undefined)
  );
}

type ContextCounts = NonNullable<ChatMessageMetadata["contextUsage"]> & { input: number };

function readContextCounts(message: HanokiUiMessage): ContextCounts | null {
  const metadata = message.metadata;
  const contextUsage = metadata?.contextUsage;

  if (typeof contextUsage?.input === "number") {
    return { ...contextUsage, input: contextUsage.input };
  }

  // Responses saved before the final step was recorded only have summed
  // usage. Without tool calls there was a single step, so the sum is exact;
  // with them every step re-counted the prompt and the sum overshoots.
  const tokens = metadata?.tokens;
  if (typeof tokens?.input === "number" && !hasToolCalls(message)) {
    return {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cached: tokens.cached,
    };
  }

  return null;
}

function hasToolCalls(message: HanokiUiMessage): boolean {
  return message.parts.some(
    (part) => part.type === "dynamic-tool" || part.type.startsWith("tool-"),
  );
}
