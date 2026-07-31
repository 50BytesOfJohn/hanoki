import { describe, expect, it } from "vitest";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import type { ChatInfo } from "@shared/ipc";
import { parseMarkdownToTiptap } from "@shared/tiptap/extensions";
import { renderChatAsHtml, serializeChatAsJson, serializeChatAsMarkdown } from "./serialize";

const chat: ChatInfo = {
  id: "chat-1",
  workspaceId: "workspace-1",
  folderId: null,
  title: "Export <test>",
  settings: { modelId: "model-1" },
  createdAt: 1,
  updatedAt: 2,
};

const messages: HanokiUiMessage[] = [
  {
    id: "message-1",
    role: "user",
    metadata: { parentId: null, createdAt: 1_750_000_000_000 },
    parts: [{ type: "data-tiptap", data: parseMarkdownToTiptap("Hello **world**") }],
  },
  {
    id: "message-2",
    role: "assistant",
    metadata: { parentId: "message-1", model: "model-1", createdAt: 1_750_000_001_000 },
    parts: [{ type: "text", text: "A `useful` answer.", state: "done" }],
  },
];
const alternateBranch: HanokiUiMessage = {
  id: "message-3",
  role: "assistant",
  metadata: { parentId: "message-1", createdAt: 1_750_000_002_000 },
  parts: [{ type: "text", text: "An alternate answer.", state: "done" }],
};

describe("chat export serialization", () => {
  it("produces readable Markdown, complete JSON, and printable HTML", () => {
    const exportedAt = new Date("2026-07-31T12:00:00.000Z");
    const markdown = serializeChatAsMarkdown(chat, messages, exportedAt);
    const json = JSON.parse(
      serializeChatAsJson(chat, messages, [...messages, alternateBranch], exportedAt),
    );
    const html = renderChatAsHtml(chat, messages, exportedAt);

    expect(markdown).toContain("# Export &lt;test&gt;");
    expect(markdown).toContain("Hello **world**");
    expect(markdown).toContain("## Assistant");
    expect(json.currentBranch).toEqual(["message-1", "message-2"]);
    expect(json.messages).toHaveLength(3);
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<title>Export &lt;test&gt;</title>");
  });
});
