import { describe, expect, it } from "vitest";

import { getBranchCost, getLatestContextUsage } from "./context-usage";
import type { ChatMessageMetadata, HanokiUiMessage } from "./message-metadata";

type Parts = HanokiUiMessage["parts"];

const textParts = [{ type: "text", text: "Answer.", state: "done" }] as unknown as Parts;
const toolParts = [
  { type: "tool-web_search", toolCallId: "call-1", state: "output-available" },
  { type: "text", text: "Answer.", state: "done" },
] as unknown as Parts;

function user(id: string): HanokiUiMessage {
  return { id, role: "user", parts: textParts, metadata: { parentId: null } };
}

function assistant(
  id: string,
  metadata: Omit<ChatMessageMetadata, "parentId">,
  parts: Parts = textParts,
): HanokiUiMessage {
  return { id, role: "assistant", parts, metadata: { parentId: null, ...metadata } };
}

const done = { times: { generation: 100 }, model: "model-a", finishReason: "stop" };

describe("getLatestContextUsage", () => {
  it("is empty before any response finishes", () => {
    expect(getLatestContextUsage([])).toEqual({ status: "empty" });
    expect(getLatestContextUsage([user("u1"), assistant("a1", { model: "model-a" })])).toEqual({
      status: "empty",
    });
  });

  it("measures the final step and leaves reasoning out of what carries forward", () => {
    const result = getLatestContextUsage([
      user("u1"),
      assistant("a1", {
        ...done,
        tokens: { input: 9_000, output: 600 },
        contextUsage: { input: 4_000, output: 300, reasoning: 100, cached: 1_000 },
      }),
    ]);

    expect(result).toEqual({
      status: "measured",
      usage: {
        messageId: "a1",
        modelId: "model-a",
        input: 4_000,
        output: 300,
        reasoning: 100,
        cached: 1_000,
        used: 4_200,
        isPartial: false,
        skippedResponses: 0,
      },
    });
  });

  it("skips a response that is still streaming", () => {
    const result = getLatestContextUsage([
      assistant("a1", { ...done, contextUsage: { input: 1_000, output: 50 } }),
      user("u2"),
      assistant("a2", { model: "model-a" }),
    ]);

    expect(result.status === "measured" && result.usage.messageId).toBe("a1");
    expect(result.status === "measured" && result.usage.skippedResponses).toBe(0);
  });

  it("falls back to an older measurement when the latest response reported none", () => {
    const result = getLatestContextUsage([
      assistant("a1", { ...done, contextUsage: { input: 1_000, output: 50 } }),
      user("u2"),
      assistant("a2", { ...done, model: "model-b" }),
    ]);

    expect(result.status === "measured" && result.usage).toMatchObject({
      messageId: "a1",
      modelId: "model-a",
      skippedResponses: 1,
    });
  });

  it("trusts summed usage from older single-step responses only", () => {
    const legacy = { ...done, tokens: { input: 2_000, output: 100, reasoning: 20 } };

    expect(getLatestContextUsage([assistant("a1", legacy)])).toMatchObject({
      status: "measured",
      usage: { input: 2_000, used: 2_080 },
    });
    expect(getLatestContextUsage([assistant("a1", legacy, toolParts)])).toEqual({
      status: "unavailable",
      modelId: "model-a",
    });
  });

  it("flags responses that were stopped or failed", () => {
    const result = getLatestContextUsage([
      assistant("a1", { ...done, finishReason: "abort", contextUsage: { input: 500 } }),
    ]);

    expect(result).toMatchObject({ status: "measured", usage: { used: 500, isPartial: true } });
  });
});

describe("getBranchCost", () => {
  it("is null when no response was priced", () => {
    expect(getBranchCost([user("u1"), assistant("a1", done)])).toBeNull();
  });

  it("sums priced responses and counts the rest", () => {
    const cost = getBranchCost([
      assistant("a1", { ...done, cost: { total: 0.002, currency: "USD" } }),
      assistant("a2", done),
      assistant("a3", { ...done, cost: { total: 0.003, currency: "USD" } }),
      assistant("a4", { model: "model-a" }),
    ]);

    expect(cost?.total).toBeCloseTo(0.005);
    expect(cost).toMatchObject({ currency: "USD", unpricedResponses: 1 });
  });
});
