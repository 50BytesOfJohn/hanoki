import { describe, expect, it } from "vitest";
import { APICallError, consumeStream, readUIMessageStream, smoothStream, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";

import { getChatStreamErrorMessage } from "../chat-stream-error";

/**
 * The continuation path in the renderer streams the response itself instead of
 * going through `Chat`, so it depends on `readUIMessageStream` turning the
 * server's `error` chunk into a thrown error. That only happens with
 * `terminateOnError`, which defaults to false — without it a failed request
 * looks exactly like a successful one.
 */

const targetMessage = {
  id: "msg-target",
  role: "assistant",
  parts: [{ type: "text", text: "The first half of the answer.", state: "done" }],
  metadata: { parentId: "msg-user" },
} as unknown as HanokiUiMessage;

function failingModel() {
  return new MockLanguageModelV3({
    doStream: async () => {
      throw new APICallError({
        message: "Insufficient credits.",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 402,
        isRetryable: false,
      });
    },
  });
}

/** Mirrors how the route builds the continuation response. */
function continuationResponse(model: ConstructorParameters<typeof MockLanguageModelV3>[0]) {
  let onEndParts: HanokiUiMessage["parts"] | null = null;
  let streamErrorMessage: string | null = null;
  let resolveEnded: () => void;
  const whenEnded = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const result = streamText({
    model: model as never,
    experimental_transform: smoothStream({ chunking: "line" }),
    messages: [{ role: "user", content: "continue" }],
  });

  const response = result.toUIMessageStreamResponse({
    consumeSseStream: consumeStream,
    originalMessages: [targetMessage],
    sendReasoning: true,
    onError: (error) => {
      streamErrorMessage = getChatStreamErrorMessage(error);
      return streamErrorMessage;
    },
    generateMessageId: () => targetMessage.id,
    onEnd: ({ responseMessage }) => {
      onEndParts = responseMessage.parts as HanokiUiMessage["parts"];
      resolveEnded();
    },
  });

  return {
    response,
    whenEnded,
    getOnEndParts: () => onEndParts,
    getStreamErrorMessage: () => streamErrorMessage,
  };
}

function sseToChunks(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, never>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          controller.enqueue(JSON.parse(data));
        }
      },
    }),
  );
}

async function readContinuation(body: ReadableStream<Uint8Array>, terminateOnError: boolean) {
  let thrown: unknown = null;
  const seen: HanokiUiMessage[] = [];

  try {
    for await (const message of readUIMessageStream<HanokiUiMessage>({
      message: structuredClone(targetMessage),
      stream: sseToChunks(body),
      terminateOnError,
    })) {
      seen.push(structuredClone(message));
    }
  } catch (error) {
    thrown = error;
  }

  return { thrown, seen };
}

describe("continuation stream error propagation", () => {
  it("surfaces the provider error to the continuation reader", async () => {
    const { response, getStreamErrorMessage } = continuationResponse(failingModel());
    const { thrown } = await readContinuation(response.body!, true);

    expect(getStreamErrorMessage()).toBe("Insufficient credits.");
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Insufficient credits.");
  });

  it("silently completes without terminateOnError (the bug this guards)", async () => {
    const { response } = continuationResponse(failingModel());
    const { thrown } = await readContinuation(response.body!, false);

    expect(thrown).toBeNull();
  });

  it("reports the error to the route so a failed continuation is not persisted", async () => {
    const midStreamFailure = new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "response-metadata", id: "r1", modelId: "m1" });
            controller.enqueue({ type: "text-start", id: "t1" });
            controller.enqueue({ type: "text-delta", id: "t1", delta: " Partial.\n" });
            controller.enqueue({ type: "error", error: new Error("Rate limit exceeded.") });
            controller.close();
          },
        }),
      }),
    });

    const { response, whenEnded, getOnEndParts, getStreamErrorMessage } =
      continuationResponse(midStreamFailure);
    const { thrown } = await readContinuation(response.body!, true);
    await whenEnded;

    expect((thrown as Error).message).toBe("Rate limit exceeded.");
    // onEnd still runs after a failed stream, which is why the route checks the
    // captured error before writing the continuation back.
    expect(getOnEndParts()).not.toBeNull();
    expect(getStreamErrorMessage()).toBe("Rate limit exceeded.");
  });
});
