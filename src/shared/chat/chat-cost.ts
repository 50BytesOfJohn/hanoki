import { type } from "arktype";
import type { ChatMessageMetadata } from "./message-metadata";

/**
 * Running spend of a chat: every model request across all branches,
 * regenerations, continuations and failed replies. Charged once per request
 * when it ends, so deleting messages does not lower it.
 */
export const chatCostSchema = type({
  total: "number >= 0",
  currency: "string",
  pricedResponses: "number.integer >= 0",
  // Requests with no price (unknown pricing or no usage), so `total` is a lower bound.
  unpricedResponses: "number.integer >= 0",
});

export type ChatCost = typeof chatCostSchema.infer;

export function addResponseCost(
  current: ChatCost | undefined,
  cost: ChatMessageMetadata["cost"] | undefined,
): ChatCost {
  const base = current ?? {
    total: 0,
    currency: cost?.currency ?? "USD",
    pricedResponses: 0,
    unpricedResponses: 0,
  };
  if (
    cost?.total === undefined ||
    !Number.isFinite(cost.total) ||
    // Totals in different currencies cannot be summed; the first one wins.
    (cost.currency !== base.currency && base.pricedResponses > 0)
  ) {
    return { ...base, unpricedResponses: base.unpricedResponses + 1 };
  }

  return {
    total: base.total + cost.total,
    currency: cost.currency,
    pricedResponses: base.pricedResponses + 1,
    unpricedResponses: base.unpricedResponses,
  };
}

export function parseChatCost(input: unknown): ChatCost | undefined {
  const parsed = chatCostSchema(input);
  return parsed instanceof type.errors ? undefined : parsed;
}
