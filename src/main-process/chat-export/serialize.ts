import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import {
  createMessageTiptapExtensions,
  parseMarkdownToTiptap,
  serializeTiptapToMarkdown,
} from "@shared/tiptap/extensions";
import { createTiptapDocumentFromText } from "@shared/tiptap/document";
import type { ChatInfo } from "@shared/ipc";

const messageExtensions = createMessageTiptapExtensions();

export function serializeChatAsMarkdown(
  chat: ChatInfo,
  messages: readonly HanokiUiMessage[],
  exportedAt = new Date(),
): string {
  const sections = messages.map((message) => {
    const details = [
      formatTimestamp(message.metadata?.createdAt),
      message.metadata?.model ? markdownInline(message.metadata.model) : null,
    ].filter(Boolean);
    const content = serializeMessageContent(message);

    return [
      `## ${roleLabel(message.role)}`,
      details.length > 0 ? `_${details.join(" · ")}_` : null,
      content || "_No readable text content. Use JSON export for structured message data._",
    ]
      .filter(Boolean)
      .join("\n\n");
  });

  const header = [
    `# ${markdownInline(chat.title)}`,
    `_Exported from Hanoki on ${exportedAt.toISOString()}._`,
  ].join("\n\n");

  return [header, ...sections].join("\n\n---\n\n");
}

export function serializeChatAsJson(
  chat: ChatInfo,
  currentBranch: readonly HanokiUiMessage[],
  allMessages: readonly HanokiUiMessage[],
  exportedAt = new Date(),
): string {
  return `${JSON.stringify(
    {
      format: "hanoki-chat",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      chat,
      currentBranch: currentBranch.map((message) => message.id),
      messages: allMessages,
    },
    null,
    2,
  )}\n`;
}

export function renderChatAsHtml(
  chat: ChatInfo,
  messages: readonly HanokiUiMessage[],
  exportedAt = new Date(),
): string {
  const document = parseMarkdownToTiptap(serializeChatAsMarkdown(chat, messages, exportedAt));
  const content = renderToHTMLString({ content: document, extensions: messageExtensions });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(chat.title)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #18181b;
        background: #ffffff;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 10.5pt;
        line-height: 1.6;
      }
      main { max-width: 760px; margin: 0 auto; }
      h1, h2, h3 { color: #09090b; line-height: 1.25; break-after: avoid; }
      h1 { margin: 0 0 8px; font-size: 24pt; letter-spacing: -0.03em; }
      h2 { margin: 0 0 10px; font-size: 14pt; }
      h3 { margin: 20px 0 8px; font-size: 11.5pt; }
      p, ul, ol, blockquote, pre { margin: 0 0 12px; }
      ul, ol { padding-left: 22px; }
      blockquote {
        margin-left: 0;
        padding-left: 14px;
        color: #52525b;
        border-left: 3px solid #d4d4d8;
      }
      code {
        padding: 1px 4px;
        border-radius: 4px;
        background: #f4f4f5;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.9em;
      }
      pre {
        overflow-wrap: anywhere;
        padding: 12px 14px;
        border-radius: 8px;
        background: #f4f4f5;
        break-inside: avoid;
      }
      pre code { padding: 0; background: transparent; }
      a { color: #2563eb; text-decoration: none; }
      hr { margin: 24px 0; border: 0; border-top: 1px solid #e4e4e7; }
      img { max-width: 100%; }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`;
}

function serializeMessageContent(message: HanokiUiMessage): string {
  return message.parts
    .flatMap((part) => {
      if (part.type === "data-tiptap") {
        return serializeTiptapToMarkdown(part.data).trim();
      }
      if (part.type === "text") {
        return part.text.trim();
      }
      return [];
    })
    .filter(Boolean)
    .join("\n\n");
}

function markdownInline(value: string): string {
  return serializeTiptapToMarkdown(
    createTiptapDocumentFromText(value.replace(/\s+/g, " ").trim()),
  ).trim();
}

function roleLabel(role: HanokiUiMessage["role"]): string {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  return "System";
}

function formatTimestamp(value: number | undefined): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
