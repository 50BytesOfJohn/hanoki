import {
  APICallError,
  InvalidToolInputError,
  LoadAPIKeyError,
  NoSuchToolError,
  RetryError,
} from "ai";

const FALLBACK_ERROR_MESSAGE = "An error occurred.";
const MAX_ERROR_MESSAGE_LENGTH = 1000;

/**
 * Known provider error substrings mapped to clearer, actionable copy for the chat UI.
 * Match against the raw provider message (case-insensitive).
 */
const KNOWN_ERROR_MESSAGES: ReadonlyArray<{ readonly includes: string; readonly message: string }> =
  [
    {
      includes: "encrypted reasoning or compaction content",
      message:
        "This conversation includes encrypted reasoning from a different model. Switch back to the original model, or start a new chat.",
    },
    {
      includes: "encrypted payloads can only be replayed",
      message:
        "This conversation includes encrypted reasoning from a different model. Switch back to the original model, or start a new chat.",
    },
  ];

/**
 * Turn a stream/agent error into a short user-facing message for the chat UI.
 * Provider API errors are surfaced (this is a local desktop app); unknown errors stay generic.
 */
export function getChatStreamErrorMessage(error: unknown): string {
  if (NoSuchToolError.isInstance(error)) {
    return "The model tried to call an unknown tool.";
  }

  if (InvalidToolInputError.isInstance(error)) {
    return "The model called a tool with invalid inputs.";
  }

  if (LoadAPIKeyError.isInstance(error)) {
    return "The provider API key is missing or invalid. Check your provider settings.";
  }

  const apiError = findApiCallError(error);
  if (apiError) {
    return formatProviderMessage(apiError.message) ?? FALLBACK_ERROR_MESSAGE;
  }

  if (error instanceof Error) {
    return formatProviderMessage(error.message) ?? FALLBACK_ERROR_MESSAGE;
  }

  if (typeof error === "string") {
    return formatProviderMessage(error) ?? FALLBACK_ERROR_MESSAGE;
  }

  return FALLBACK_ERROR_MESSAGE;
}

function findApiCallError(error: unknown): APICallError | null {
  if (APICallError.isInstance(error)) {
    return error;
  }

  if (RetryError.isInstance(error)) {
    if (APICallError.isInstance(error.lastError)) {
      return error.lastError;
    }

    for (let index = error.errors.length - 1; index >= 0; index -= 1) {
      const candidate = error.errors[index];
      if (APICallError.isInstance(candidate)) {
        return candidate;
      }
    }
  }

  if (error instanceof Error && error.cause != null) {
    return findApiCallError(error.cause);
  }

  return null;
}

function formatProviderMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  for (const known of KNOWN_ERROR_MESSAGES) {
    if (normalized.includes(known.includes)) {
      return known.message;
    }
  }

  if (trimmed.length > MAX_ERROR_MESSAGE_LENGTH) {
    return `${trimmed.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
  }

  return trimmed;
}
