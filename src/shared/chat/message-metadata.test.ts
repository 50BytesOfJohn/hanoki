import { describe, expect, it } from "vitest";
import { normalizeChatMessageMetadata, parseChatMessageMetadata } from "./message-metadata";

describe("parseChatMessageMetadata", () => {
  it("accepts usage from providers that report no token counts", () => {
    // JSON drops `undefined`, so a provider without token counts sends empty detail objects.
    const parsed = parseChatMessageMetadata({
      parentId: "019fc426-98c9-74df-af9d-bb634588496b",
      provider: "openrouter",
      model: "019d062b-9254-73df-b67b-9b68e50b6b51:moonshotai/kimi-k3",
      usage: { inputTokenDetails: {}, outputTokenDetails: {} },
      tokens: {},
      times: { generation: 113753 },
      finishReason: "other",
    });

    expect(parsed.ok).toBe(true);
  });

  it("still accepts fully populated usage", () => {
    const parsed = parseChatMessageMetadata({
      parentId: null,
      usage: {
        inputTokens: 100,
        inputTokenDetails: { noCacheTokens: 80, cacheReadTokens: 20, cacheWriteTokens: undefined },
        outputTokens: 10,
        outputTokenDetails: { textTokens: 8, reasoningTokens: 2 },
        totalTokens: 110,
      },
    });

    expect(parsed.ok).toBe(true);
  });

  it("falls back to the parent id when metadata is invalid", () => {
    expect(normalizeChatMessageMetadata({ parentId: 42 }, "parent-1")).toEqual({
      parentId: "parent-1",
    });
  });
});
