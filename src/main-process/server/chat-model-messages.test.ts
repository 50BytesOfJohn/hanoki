import { describe, expect, it } from "vitest";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";

import { toModelMessages } from "./chat-model-messages";

describe("toModelMessages", () => {
  it("joins the user turns around a workflow run with no text", async () => {
    const messages: HanokiUiMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "First" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "data-workflowRun",
            id: "run",
            data: {
              runId: "run",
              workflowId: null,
              name: "Flow",
              status: "error",
              graph: { nodes: [], edges: [] },
              outputNodeId: null,
              startedAt: 0,
            },
          },
        ],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "Second" }] },
    ];

    const result = await toModelMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    const content = result[0]?.content;
    const text =
      typeof content === "string"
        ? content
        : (content ?? []).map((part) => ("text" in part ? part.text : "")).join("");
    expect(text).toContain("First");
    expect(text).toContain("Second");
  });
});
