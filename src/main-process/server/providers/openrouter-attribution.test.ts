import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { sdkProviderRegistry } from "./sdk-provider-registry";

afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter app attribution on the wire", () => {
  it("identifies Hanoki on completion requests", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init: RequestInit) =>
      Response.json({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "test/model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: "Done" },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const model = await sdkProviderRegistry.openrouter.createLanguageModel(
      "test-key",
      "test/model",
    );
    await generateText({ model, prompt: "Hello" });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1].headers);
    expect(headers.get("HTTP-Referer")).toBe("https://hanoki.app");
    expect(headers.get("X-OpenRouter-Title")).toBe("Hanoki");
    expect(headers.get("X-OpenRouter-Categories")).toBe("general-chat");
  });
});
