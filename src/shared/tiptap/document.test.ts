import { describe, expect, it } from "vitest";

import type { HanokiUiMessage } from "../chat/message-metadata";
import {
  createTiptapDocumentFromText,
  createTiptapMessageParts,
  getMessageDisplayText,
  isHanokiToolEnabledForRequest,
  isWebToolEnabledForRequest,
  parseTiptapDocument,
  type TiptapDocument,
} from "./document";
import {
  getTiptapMessageDisplayText,
  normalizeAssistantTiptapParts,
  parseMarkdownToTiptap,
  serializeTiptapToMarkdown,
} from "./extensions";

describe("parseTiptapDocument", () => {
  it("parses plain text as a text-only document", () => {
    const parsed = parseTiptapDocument(createTiptapDocumentFromText("Hello world"));

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        displayText: "Hello world",
        modelText: "Hello world",
        selectedToolIds: [],
        isTextOnly: true,
      },
    });
  });

  it("serializes paragraphs with blank lines and hard breaks with single newlines", () => {
    const document: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "first" },
            { type: "hardBreak" },
            { type: "text", text: "second" },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "third" }] },
      ],
    };

    const parsed = parseTiptapDocument(document);
    expect(parsed.ok && parsed.value.displayText).toBe("first\nsecond\n\nthird");
    expect(parsed.ok && parsed.value.modelText).toBe("first\nsecond\n\nthird");
  });

  it("renders a selected Web mention differently for display and model input", () => {
    const document: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Please use " },
            { type: "mention", attrs: { id: "web", label: "Web" } },
            { type: "text", text: " for this." },
          ],
        },
      ],
    };

    const parsed = parseTiptapDocument(document);
    expect(parsed.ok && parsed.value.displayText).toBe("Please use @Web for this.");
    expect(parsed.ok && parsed.value.modelText).toBe("Please use Web tool for this.");
    expect(parsed.ok && parsed.value.selectedToolIds).toEqual(["web"]);
    expect(parsed.ok && parsed.value.isTextOnly).toBe(false);
  });

  it("renders and enables a request-scoped Hanoki mention", () => {
    const document: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "hanoki", label: "Hanoki" } }],
        },
      ],
    };
    const parsed = parseTiptapDocument(document);
    const message = {
      parts: [{ type: "data-tiptap", data: document }],
    } as Pick<HanokiUiMessage, "parts">;

    expect(parsed.ok && parsed.value.displayText).toBe("@Hanoki");
    expect(parsed.ok && parsed.value.modelText).toBe("Hanoki tool");
    expect(parsed.ok && parsed.value.selectedToolIds).toEqual(["hanoki"]);
    expect(isHanokiToolEnabledForRequest(false, message)).toBe(true);
  });

  it("rejects unsupported mention IDs", () => {
    const parsed = parseTiptapDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "files", label: "Files" } }],
        },
      ],
    });

    expect(parsed).toEqual({
      ok: false,
      error: "doc.content[0].content[0] contains an unsupported mention ID.",
    });
  });

  it("retains formatting documents as structured message parts", () => {
    const document: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "important", marks: [{ type: "bold" }] }],
        },
      ],
    };

    const parsed = parseTiptapDocument(document);
    expect(parsed.ok && parsed.value.isTextOnly).toBe(false);
    expect(createTiptapMessageParts(document)).toEqual([{ type: "data-tiptap", data: document }]);
  });

  it("stores text-only documents as one complete AI SDK text part", () => {
    const document = createTiptapDocumentFromText("one\ntwo\n\nthree");
    expect(createTiptapMessageParts(document)).toEqual([
      { type: "text", text: "one\ntwo\n\nthree" },
    ]);
  });

  it("reads legacy text parts together with structured parts", () => {
    const structured = createTiptapDocumentFromText("structured");
    structured.content[0]?.content?.push({
      type: "mention",
      attrs: { id: "web", label: "Web" },
    });
    const message = {
      parts: [
        { type: "text", text: "legacy" },
        { type: "data-tiptap", data: structured },
      ],
    } as Pick<HanokiUiMessage, "parts">;

    expect(getMessageDisplayText(message)).toBe("legacy\nstructured@Web");
  });

  it("parses assistant Markdown with maintained Tiptap formatting", () => {
    const document = parseMarkdownToTiptap("A **bold** answer");
    const parsed = parseTiptapDocument(document);

    expect(parsed.ok && parsed.value.displayText).toBe("A bold answer");
    expect(parsed.ok && parsed.value.isTextOnly).toBe(false);
    expect(
      getTiptapMessageDisplayText({
        role: "assistant",
        parts: [{ type: "text", text: "A **bold** answer" }],
      }),
    ).toBe("A bold answer");
  });

  it("keeps chat-wide Web enabled and scopes mention enablement to one request", () => {
    const plainMessage = {
      parts: [{ type: "text", text: "plain" }],
    } as Pick<HanokiUiMessage, "parts">;
    const mentionDocument: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "web", label: "Web" } }],
        },
      ],
    };
    const mentionMessage = {
      parts: [{ type: "data-tiptap", data: mentionDocument }],
    } as Pick<HanokiUiMessage, "parts">;

    expect(isWebToolEnabledForRequest(true, plainMessage)).toBe(true);
    expect(isWebToolEnabledForRequest(false, mentionMessage)).toBe(true);
    expect(isWebToolEnabledForRequest(false, plainMessage)).toBe(false);
  });

  it("normalizes completed assistant blocks without moving tool calls", () => {
    const toolPart = {
      type: "dynamic-tool",
      toolName: "webSearch",
      toolCallId: "call-1",
      state: "output-available",
      input: { query: "Tiptap" },
      output: { results: [] },
    } as HanokiUiMessage["parts"][number];
    const normalized = normalizeAssistantTiptapParts([
      { type: "text", text: "**Before**" },
      toolPart,
      { type: "text", text: "After" },
    ]);

    expect(normalized.map((part) => part.type)).toEqual(["data-tiptap", "dynamic-tool", "text"]);
    expect(normalized[1]).toBe(toolPart);
    expect(normalized[2]).toMatchObject({ type: "text", text: "After", state: "done" });
  });

  it("preserves assistant Markdown when serialized for Streamdown", () => {
    const markdown = "# Heading\n\n- **Bold** item\n- `code` item";

    expect(serializeTiptapToMarkdown(parseMarkdownToTiptap(markdown))).toBe(markdown);
  });
});
