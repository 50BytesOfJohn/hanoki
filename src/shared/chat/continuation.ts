import type { HanokiUiMessage } from "./message-metadata";

type MessageParts = HanokiUiMessage["parts"];

/**
 * Parts the model produced for a "continue this message" request.
 *
 * The AI SDK seeds the streamed/response message with the assistant message it
 * is continuing (`originalMessages.at(-1)`, or the `message` handed to
 * `readUIMessageStream`), then pushes new parts onto it. So the continuation is
 * exactly what sits past the seed, by position — never guess it by comparing
 * part contents: the seed and the stored copy can legitimately differ, and a
 * failed comparison silently re-appends the whole message.
 *
 * `step-start` markers are dropped: nothing renders them, and a step boundary
 * belonging to the synthetic continuation prompt is meaningless in the middle
 * of the message it gets merged into.
 */
export function getContinuationParts(seedParts: MessageParts, responseParts: MessageParts) {
  return responseParts.slice(seedParts.length).filter((part) => part.type !== "step-start");
}

/**
 * Appends continuation parts to the message being continued, splicing the first
 * new text part onto the trailing text part so the resumed sentence reads as one
 * block instead of restarting a new one.
 */
export function appendContinuationParts(
  originalParts: MessageParts,
  continuationParts: MessageParts,
): MessageParts {
  if (continuationParts.length === 0) {
    return structuredClone(originalParts) as MessageParts;
  }

  const mergedParts = structuredClone(originalParts) as MessageParts;
  const remainingParts = structuredClone(continuationParts) as MessageParts;
  const lastOriginalTextIndex = findLastTextPartIndex(mergedParts);
  const firstContinuationTextIndex = remainingParts.findIndex((part) => part.type === "text");

  if (lastOriginalTextIndex === -1 || firstContinuationTextIndex === -1) {
    return [...mergedParts, ...remainingParts];
  }

  const [firstContinuationTextPart] = remainingParts.splice(firstContinuationTextIndex, 1);
  const lastOriginalTextPart = mergedParts[lastOriginalTextIndex];

  if (
    !firstContinuationTextPart ||
    firstContinuationTextPart.type !== "text" ||
    !lastOriginalTextPart ||
    lastOriginalTextPart.type !== "text"
  ) {
    return [...mergedParts, ...structuredClone(continuationParts)];
  }

  mergedParts[lastOriginalTextIndex] = {
    ...lastOriginalTextPart,
    text: `${lastOriginalTextPart.text}${firstContinuationTextPart.text}`,
    providerMetadata:
      firstContinuationTextPart.providerMetadata ?? lastOriginalTextPart.providerMetadata,
    state: firstContinuationTextPart.state ?? lastOriginalTextPart.state,
  };

  return [...mergedParts, ...remainingParts];
}

function findLastTextPartIndex(parts: MessageParts) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index]?.type === "text") {
      return index;
    }
  }

  return -1;
}
