import { afterEach, describe, expect, it, vi } from "vitest";
import { isStepCount, jsonSchema, tool, ToolLoopAgent } from "ai";
import { sdkProviderRegistry } from "./sdk-provider-registry";
import { buildChatProviderOptions } from "./chat-provider-options";

afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter temperature on the wire", () => {
  it("retains zero and parameter enforcement across a tool loop and non-streaming calls", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        const isToolStep = bodies.length === 1;
        return Response.json({
          id: `test-${bodies.length}`,
          object: "chat.completion",
          created: 0,
          model: "test/model",
          choices: [
            {
              index: 0,
              finish_reason: isToolStep ? "tool_calls" : "stop",
              message: isToolStep
                ? {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "lookup-1",
                        type: "function",
                        function: { name: "lookup", arguments: "{}" },
                      },
                    ],
                  }
                : { role: "assistant", content: "Done" },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }),
    );
    const model = await sdkProviderRegistry.openrouter.createLanguageModel(
      "test-key",
      "test/model",
    );
    const agent = new ToolLoopAgent({
      model,
      temperature: 0,
      providerOptions: buildChatProviderOptions("openrouter", undefined, 0),
      tools: {
        lookup: tool({
          inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
          execute: async () => "Found",
        }),
      },
      stopWhen: isStepCount(3),
    });
    expect((await agent.generate({ prompt: "Look up a value" })).text).toBe("Done");
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).toMatchObject({ temperature: 0, provider: { require_parameters: true } });
    }
  });

  it.each([undefined, 0, 0.7, 1.6, 2])(
    "serializes streaming temperature %s through the actual provider and agent",
    async (temperature) => {
      const bodies: Record<string, unknown>[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: unknown, init: RequestInit) => {
          bodies.push(JSON.parse(init.body as string));
          const chunks = [
            {
              id: "test",
              object: "chat.completion.chunk",
              created: 0,
              model: "test/model",
              choices: [
                { index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null },
              ],
            },
            {
              id: "test",
              object: "chat.completion.chunk",
              created: 0,
              model: "test/model",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            },
          ];
          return new Response(
            chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
              "data: [DONE]\n\n",
            {
              headers: { "content-type": "text/event-stream" },
            },
          );
        }),
      );

      const model = await sdkProviderRegistry.openrouter.createLanguageModel(
        "test-key",
        "test/model",
      );
      const agent = new ToolLoopAgent({
        model,
        temperature,
        providerOptions: buildChatProviderOptions("openrouter", "high", temperature),
      });
      const result = await agent.stream({ prompt: "Hello" });
      expect(await result.text).toBe("Hello");
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        stream: true,
        reasoning: { effort: "high" },
      });
      if (temperature === undefined) {
        expect(bodies[0]).not.toHaveProperty("temperature");
        expect(bodies[0]).not.toHaveProperty("provider");
      } else {
        expect(bodies[0]).toMatchObject({
          temperature,
          provider: { require_parameters: true },
        });
      }
    },
  );

  it("enforces a custom zero without needing a reasoning override", () => {
    expect(buildChatProviderOptions("openrouter", undefined, 0)).toEqual({
      openrouter: { provider: { require_parameters: true } },
    });
    expect(buildChatProviderOptions("openrouter", undefined, undefined)).toBeUndefined();
    expect(buildChatProviderOptions("anthropic", "high", 0)).toBeUndefined();
    expect(buildChatProviderOptions("huggingface", "high", 0)).toEqual({
      huggingface: { reasoningEffort: "high" },
    });
  });
});
