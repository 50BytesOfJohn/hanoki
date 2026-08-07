import { pruneMessages, type ModelMessage } from "ai";

/**
 * Drops reasoning from every completed turn, keeping only the turn currently
 * in flight (everything after the last user message).
 *
 * Reasoning parts carry provider payloads that are bound to the endpoint that
 * produced them — xAI/OpenAI encrypted reasoning, Anthropic thinking
 * signatures, Gemini thought signatures. A chat here can switch models between
 * turns, continue one model's message with another, or regenerate a branch, so
 * replaying stored reasoning eventually sends one model's sealed payload to
 * another and the request is rejected outright ("Encrypted payloads can only be
 * replayed to the endpoint that created them", OpenRouter 404).
 *
 * The in-flight turn is exempt because a tool-approval resume must send back
 * the assistant message that made the tool call with its reasoning intact —
 * providers reject a tool result whose preceding thinking block went missing.
 *
 * ponytail: turn-level granularity, not per-part model matching. The stored
 * `metadata.model` cannot be trusted for this — a continued message keeps the
 * reasoning of the model that started it while metadata names the model that
 * finished it.
 */
export function stripReplayedReasoning(messages: ModelMessage[]): ModelMessage[] {
  let inFlightTurnStart = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      inFlightTurnStart = index + 1;
      break;
    }
  }

  return [
    ...pruneMessages({
      messages: messages.slice(0, inFlightTurnStart),
      reasoning: "all",
    }),
    ...messages.slice(inFlightTurnStart),
  ];
}
