import { Mention, type MentionOptions } from "@tiptap/extension-mention";
import { StarterKit } from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/core";

import type { HanokiUiMessage } from "../chat/message-metadata";
import {
  CHAT_TOOL_LABELS,
  WEB_TOOL_LABEL,
  createTiptapMessageParts,
  isChatToolId,
  parseTiptapDocument,
  type TiptapDocument,
  type TiptapNode,
} from "./document";

function getToolLabel(toolId: unknown): string {
  return isChatToolId(toolId) ? CHAT_TOOL_LABELS[toolId] : WEB_TOOL_LABEL;
}

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
      renderText: ({ node }) => `@${getToolLabel(node.attrs.id)}`,
      renderHTML: ({ node }) => {
        const label = getToolLabel(node.attrs.id);
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

// Tiptap's markdown serializer crashes on a childless listItem
// (renderNestedMarkdownContent destructures content[0]), and stray markdown
// like a bare "9." parses into one. Drop them on both ends.
function dropEmptyListItems<T extends TiptapNode>(node: T): T {
  if (!node.content) {
    return node;
  }
  const content = node.content
    .map(dropEmptyListItems)
    .filter((child) => child.type !== "listItem" || (child.content?.length ?? 0) > 0);
  return { ...node, content };
}

export function parseMarkdownToTiptap(markdown: string): TiptapDocument {
  return dropEmptyListItems(markdownManager.parse(markdown) as TiptapDocument);
}

export function serializeTiptapToMarkdown(document: TiptapDocument): string {
  return markdownManager.serialize(dropEmptyListItems(document));
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
