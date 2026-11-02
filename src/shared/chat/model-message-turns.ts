import type { ModelMessage, TextPart } from "ai";

/**
 * Joins neighbouring user or assistant turns into one. Text-only turns stay a
 * single string, which OpenAI-compatible servers expect; anything else keeps
 * every part in order. `roles` limits which turns are joined.
 */
export function mergeSameRoleTurns(
  messages: readonly ModelMessage[],
  roles: readonly ("user" | "assistant")[] = ["user", "assistant"],
): ModelMessage[] {
  const merged: ModelMessage[] = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous?.role === "user" && message.role === "user" && roles.includes("user")) {
      merged[merged.length - 1] = {
        ...previous,
        content: joinContent(previous.content, message.content),
      };
    } else if (
      previous?.role === "assistant" &&
      message.role === "assistant" &&
      roles.includes("assistant")
    ) {
      merged[merged.length - 1] = {
        ...previous,
        content: joinContent(previous.content, message.content),
      };
    } else {
      merged.push(message);
    }
  }
  return merged;
}

function joinContent<T extends { type: string }>(
  first: string | readonly T[],
  second: string | readonly T[],
): string | (T | TextPart)[] {
  const firstText = asText(first);
  const secondText = asText(second);
  if (firstText !== null && secondText !== null) return `${firstText}\n\n${secondText}`;
  return [...toParts(first), ...toParts(second)];
}

function asText(content: string | readonly { type: string }[]): string | null {
  if (typeof content === "string") return content;
  const texts: string[] = [];
  for (const part of content) {
    if (part.type !== "text" || !("text" in part) || typeof part.text !== "string") return null;
    texts.push(part.text);
  }
  return texts.join("\n\n");
}

function toParts<T extends { type: string }>(content: string | readonly T[]): (T | TextPart)[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : [...content];
}
