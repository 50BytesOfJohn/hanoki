import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import { stripReplayedReasoning } from "./reasoning-replay";

const encryptedReasoning = {
  type: "reasoning" as const,
  text: "Thinking about it.",
  providerOptions: {
    openrouter: {
      reasoning_details: [
        { type: "reasoning.encrypted", data: "sealed-by-grok", format: "xai-responses-v1" },
      ],
    },
  },
};

describe("stripReplayedReasoning", () => {
  it("drops reasoning from completed turns", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "First question." },
      { role: "assistant", content: [encryptedReasoning, { type: "text", text: "First answer." }] },
      { role: "user", content: "Second question." },
    ];

    expect(stripReplayedReasoning(messages)).toEqual([
      { role: "user", content: "First question." },
      { role: "assistant", content: [{ type: "text", text: "First answer." }] },
      { role: "user", content: "Second question." },
    ]);
  });

  it("keeps reasoning in the in-flight turn, so a tool approval can resume", () => {
    const toolCall = {
      type: "tool-call" as const,
      toolCallId: "call-1",
      toolName: "terminal",
      input: { command: "ls" },
    };
    const messages: ModelMessage[] = [
      { role: "user", content: "Older question." },
      { role: "assistant", content: [encryptedReasoning, { type: "text", text: "Older answer." }] },
      { role: "user", content: "Run something." },
      { role: "assistant", content: [encryptedReasoning, toolCall] },
      {
        role: "tool",
        content: [{ type: "tool-approval-response", approvalId: "approval-1", approved: true }],
      },
    ];

    const pruned = stripReplayedReasoning(messages);

    expect(pruned[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Older answer." }],
    });
    expect(pruned[3]).toEqual({ role: "assistant", content: [encryptedReasoning, toolCall] });
  });
});
