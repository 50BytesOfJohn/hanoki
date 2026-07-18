import { Mention, type MentionOptions } from "@tiptap/extension-mention";
import { StarterKit } from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/core";

import type { HanokiUiMessage } from "../chat/message-metadata";
import {
  HANOKI_TOOL_ID,
  HANOKI_TOOL_LABEL,
  WEB_TOOL_LABEL,
  createTiptapMessageParts,
  parseTiptapDocument,
  type TiptapDocument,
} from "./document";

interface MessageTiptapExtensionOptions {
  suggestion?: MentionOptions["suggestion"];
}

export function createMessageTiptapExtensions({
  suggestion,
}: MessageTiptapExtensionOptions = {}): Extensions {
  return [
    StarterKit,
    Mention.configure({
      HTMLAttributes: {
        class: "tiptap-tool-mention",
      },
      renderText: ({ node }) =>
        `@${node.attrs.id === HANOKI_TOOL_ID ? HANOKI_TOOL_LABEL : WEB_TOOL_LABEL}`,
      renderHTML: ({ node }) => {
        const label = node.attrs.id === HANOKI_TOOL_ID ? HANOKI_TOOL_LABEL : WEB_TOOL_LABEL;
        return [
          "span",
          {
            class: "tiptap-tool-mention",
            "data-tool-id": node.attrs.id,
          },
          `@${label}`,
        ];
      },
      ...(suggestion ? { suggestion } : {}),
    }),
  ];
}

const markdownManager = new MarkdownManager({
  extensions: createMessageTiptapExtensions(),
});

export function parseMarkdownToTiptap(markdown: string): TiptapDocument {
  return markdownManager.parse(markdown) as TiptapDocument;
}

export function serializeTiptapToMarkdown(document: TiptapDocument): string {
  return markdownManager.serialize(document);
}

export function getTiptapMessageDisplayText(
  message: Pick<HanokiUiMessage, "parts" | "role">,
): string {
  const blocks: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      if (message.role === "assistant" && part.state !== "done") {
        const parsed = parseTiptapDocument(parseMarkdownToTiptap(part.text));
        blocks.push(parsed.ok ? parsed.value.displayText : part.text);
      } else {
        blocks.push(part.text);
      }
      continue;
    }
    if (part.type === "data-tiptap") {
      const parsed = parseTiptapDocument(part.data);
      if (parsed.ok) {
        blocks.push(parsed.value.displayText);
      }
    }
  }
  return blocks.join("\n");
}

export function normalizeAssistantTiptapParts(
  parts: HanokiUiMessage["parts"],
): HanokiUiMessage["parts"] {
  const normalized: HanokiUiMessage["parts"] = [];
  for (const part of parts) {
    if (part.type !== "text") {
      normalized.push(part);
      continue;
    }

    const normalizedPart = createTiptapMessageParts(parseMarkdownToTiptap(part.text))[0];
    if (!normalizedPart) {
      continue;
    }
    if (normalizedPart.type === "text") {
      normalized.push({
        ...normalizedPart,
        providerMetadata: part.providerMetadata,
        state: "done",
      });
      continue;
    }
    normalized.push(normalizedPart);
  }
  return normalized;
}
