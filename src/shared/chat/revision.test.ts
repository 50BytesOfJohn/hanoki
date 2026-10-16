import { describe, expect, it } from "vitest";
import { convertToModelMessages } from "ai";

import { createTiptapDocumentFromText } from "../tiptap/document";
import type { HanokiUiMessage } from "./message-metadata";
import { stripReplayedReasoning } from "./reasoning-replay";
import { buildRevisionPrompt, getRevisionSourceText, insertRevisionTurn } from "./revision";

type Parts = HanokiUiMessage["parts"];

const revision = {
  sourceMessageId: "assistant-1",
  note: "Make it shorter.",
  sourceText: "A long answer.",
};

const history: HanokiUiMessage[] = [
  { id: "user-1", role: "user", parts: [{ type: "text", text: "Explain it." }] },
];

describe("getRevisionSourceText", () => {
  it("joins visible text and tiptap parts and skips everything else", () => {
    const parts = [
      { type: "step-start" },
      { type: "reasoning", text: "Hidden thoughts.", state: "done" },
      { type: "text", text: "  First paragraph. ", state: "done" },
      {
        type: "tool-webSearch",
        toolCallId: "call-1",
        state: "output-available",
        input: {},
        output: {},
      },
      { type: "file", mediaType: "image/png", url: "data:," },
      { type: "data-tiptap", data: createTiptapDocumentFromText("Second paragraph.") },
    ] as unknown as Parts;

    expect(getRevisionSourceText(parts)).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("returns an empty string when nothing visible is left", () => {
    const parts = [
      { type: "reasoning", text: "Only thinking.", state: "done" },
      { type: "text", text: "   ", state: "done" },
    ] as unknown as Parts;

    expect(getRevisionSourceText(parts)).toBe("");
  });
});

describe("buildRevisionPrompt", () => {
  it("wraps the note in revision instructions", () => {
    const prompt = buildRevisionPrompt("Use bullet points.");

    expect(prompt).toContain("<note>\nUse bullet points.\n</note>");
    expect(prompt.startsWith("Revise your previous response according to this note:")).toBe(true);
    expect(prompt).toContain("Do not mention the note, the revision, or the previous version.");
  });
});

describe("insertRevisionTurn", () => {
  it("appends the previous response and the note after the parent user message", () => {
    const result = insertRevisionTurn(history, revision);

    expect(result.map((message) => [message.id, message.role])).toEqual([
      ["user-1", "user"],
      ["revision-draft:assistant-1", "assistant"],
      ["revision-note:assistant-1", "user"],
    ]);
    expect(result[1]?.parts).toEqual([{ type: "text", text: "A long answer.", state: "done" }]);
    expect(result[2]?.parts).toEqual([
      { type: "text", text: buildRevisionPrompt("Make it shorter.") },
    ]);
  });

  it("goes in front of the in-flight assistant message on a tool-approval resume", () => {
    const inFlight: HanokiUiMessage = {
      id: "revision-1",
      role: "assistant",
      parts: [{ type: "text", text: "Short.", state: "done" }],
    };
    const messages = [...history, inFlight];
    const snapshot = structuredClone(messages);

    const result = insertRevisionTurn(messages, revision);

    expect(result.map((message) => message.id)).toEqual([
      "user-1",
      "revision-draft:assistant-1",
      "revision-note:assistant-1",
      "revision-1",
    ]);
    expect(messages).toEqual(snapshot);
  });

  it("keeps the in-flight reasoning and tool call when resumed", async () => {
    const inFlight = {
      id: "revision-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "reasoning", text: "Need to search.", state: "done" },
        {
          type: "tool-webSearch",
          toolCallId: "call-1",
          state: "output-available",
          input: { query: "x" },
          output: { results: [] },
        },
      ],
    } as unknown as HanokiUiMessage;

    const modelMessages = stripReplayedReasoning(
      await convertToModelMessages(insertRevisionTurn([...history, inFlight], revision)),
    );
    const last = modelMessages.filter((message) => message.role === "assistant").at(-1);

    expect(modelMessages.at(-3)?.role).toBe("user");
    expect(last?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "reasoning", text: "Need to search." }),
        expect.objectContaining({ type: "tool-call", toolCallId: "call-1" }),
      ]),
    );
  });
});
