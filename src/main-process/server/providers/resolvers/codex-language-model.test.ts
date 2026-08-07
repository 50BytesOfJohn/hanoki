import { describe, expect, it } from "vitest";

import { isAccessTokenStale } from "../../../providers/codex-auth";
import type { CodexModelDefinition } from "../../../providers/codex-models";
import { buildCodexRequestBody, collapseCodexStream } from "./codex-language-model";

const model: CodexModelDefinition = {
  slug: "gpt-5.3-codex",
  displayName: "GPT-5.3-Codex",
  description: null,
  instructions: "You are Codex.",
  defaultReasoningEffort: "low",
  metadata: {},
};

function createAccessToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("buildCodexRequestBody", () => {
  it("replaces caller instructions with the backend's own and keeps them as a developer message", () => {
    const body = buildCodexRequestBody(
      {
        model: "gpt-5.3-codex",
        instructions: "Answer in Polish.",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      },
      model,
    );

    expect(body.instructions).toBe("You are Codex.");
    expect(body.input).toEqual([
      {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "Answer in Polish." }],
      },
      { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
    ]);
  });

  it("forces stateless streaming and drops parameters the backend rejects", () => {
    const body = buildCodexRequestBody(
      {
        model: "gpt-5.3-codex",
        store: true,
        stream: false,
        temperature: 0.7,
        max_output_tokens: 100,
        metadata: { a: 1 },
        previous_response_id: "resp_1",
        input: [],
      },
      model,
    );

    expect(body).toMatchObject({ store: false, stream: true });
    expect(body.include).toContain("reasoning.encrypted_content");
    expect(body.reasoning).toEqual({ effort: "low", summary: "auto" });
    for (const dropped of [
      "temperature",
      "max_output_tokens",
      "metadata",
      "previous_response_id",
    ]) {
      expect(body).not.toHaveProperty(dropped);
    }
  });

  it("strips item ids and server-state references from the conversation", () => {
    const body = buildCodexRequestBody(
      {
        model: "gpt-5.3-codex",
        input: [
          { type: "item_reference", id: "msg_1" },
          { type: "message", id: "msg_2", role: "user", content: [] },
        ],
      },
      model,
    );

    expect(body.input).toEqual([{ type: "message", role: "user", content: [] }]);
  });

  it("keeps an explicitly requested reasoning effort", () => {
    const body = buildCodexRequestBody(
      { model: "gpt-5.3-codex", input: [], reasoning: { effort: "high" } },
      model,
    );

    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
  });
});

describe("collapseCodexStream", () => {
  function sse(events: Record<string, unknown>[]): string {
    return events
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n`)
      .join("\n");
  }

  it("rebuilds the output items the completion event leaves empty", () => {
    const collapsed = collapseCodexStream(
      sse([
        { type: "response.created", response: { id: "resp_1", output: [] } },
        {
          type: "response.output_item.done",
          output_index: 1,
          item: { type: "message", id: "msg_1" },
        },
        {
          type: "response.output_item.done",
          output_index: 0,
          item: { type: "reasoning", id: "rs_1" },
        },
        { type: "response.completed", response: { id: "resp_1", output: [], status: "completed" } },
      ]),
    );

    expect(collapsed).toEqual({
      id: "resp_1",
      status: "completed",
      output: [
        { type: "reasoning", id: "rs_1" },
        { type: "message", id: "msg_1" },
      ],
    });
  });

  it("throws when the stream never completes", () => {
    expect(() => collapseCodexStream(sse([{ type: "response.created", response: {} }]))).toThrow(
      /without a completed response/,
    );
  });
});

describe("isAccessTokenStale", () => {
  const now = 1_800_000_000_000;

  it("keeps a token that is comfortably valid", () => {
    expect(isAccessTokenStale(createAccessToken({ exp: now / 1000 + 3600 }), now)).toBe(false);
  });

  it("refreshes inside the expiry skew and after expiry", () => {
    expect(isAccessTokenStale(createAccessToken({ exp: now / 1000 + 60 }), now)).toBe(true);
    expect(isAccessTokenStale(createAccessToken({ exp: now / 1000 - 60 }), now)).toBe(true);
  });

  it("refreshes when the expiry cannot be read", () => {
    expect(isAccessTokenStale("not-a-jwt", now)).toBe(true);
    expect(isAccessTokenStale(createAccessToken({}), now)).toBe(true);
  });
});
