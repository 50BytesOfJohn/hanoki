import {
  APICallError,
  InvalidToolInputError,
  LoadAPIKeyError,
  NoSuchToolError,
  RetryError,
} from "ai";
import { describe, expect, it } from "vitest";

import { getChatStreamErrorMessage } from "./chat-stream-error";

describe("getChatStreamErrorMessage", () => {
  it("maps encrypted reasoning / model mismatch errors to actionable copy", () => {
    const error = new APICallError({
      message:
        "Your request contains encrypted reasoning or compaction content that was produced under a different model. Encrypted payloads can only be replayed to the endpoint that created them. Send this conversation to the original model, or start a new conversation without the encrypted items.",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 404,
      responseBody:
        '{"error":{"message":"Your request contains encrypted reasoning or compaction content that was produced under a different model.","code":404}}',
      isRetryable: false,
    });

    expect(getChatStreamErrorMessage(error)).toBe(
      "This conversation includes encrypted reasoning from a different model. Switch back to the original model, or start a new chat.",
    );
  });

  it("unwraps APICallError from RetryError", () => {
    const apiError = new APICallError({
      message: "Insufficient credits",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 402,
      isRetryable: false,
    });
    const error = new RetryError({
      message: "Failed after 3 attempts",
      reason: "errorNotRetryable",
      errors: [apiError],
    });

    expect(getChatStreamErrorMessage(error)).toBe("Insufficient credits");
  });

  it("surfaces plain provider API messages", () => {
    const error = new APICallError({
      message: "Rate limit exceeded. Please try again later.",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    });

    expect(getChatStreamErrorMessage(error)).toBe("Rate limit exceeded. Please try again later.");
  });

  it("handles known AI SDK tool errors", () => {
    expect(
      getChatStreamErrorMessage(
        new NoSuchToolError({ toolName: "missing", availableTools: ["webSearch"] }),
      ),
    ).toBe("The model tried to call an unknown tool.");

    expect(
      getChatStreamErrorMessage(
        new InvalidToolInputError({
          toolName: "webSearch",
          toolInput: "{}",
          cause: new Error("invalid"),
        }),
      ),
    ).toBe("The model called a tool with invalid inputs.");

    expect(getChatStreamErrorMessage(new LoadAPIKeyError({ message: "missing key" }))).toBe(
      "The provider API key is missing or invalid. Check your provider settings.",
    );
  });

  it("falls back for unknown errors", () => {
    expect(getChatStreamErrorMessage(undefined)).toBe("An error occurred.");
    expect(getChatStreamErrorMessage({ weird: true })).toBe("An error occurred.");
    expect(getChatStreamErrorMessage(new Error("   "))).toBe("An error occurred.");
  });
});
