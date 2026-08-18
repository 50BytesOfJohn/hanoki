import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";

import { getChatCurrentBranchId } from "../chat-tree/repository";
import { closeAppDatabase, getAppDatabase } from "../db/database";
import { messages } from "../db/schema";
import { getMessageById, listMessagesByChatId, upsertMessage } from "../messages/repository";
import {
  persistGeneratedAssistantMessage,
  persistRequestUserMessage,
} from "./chat-message-persistence";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-chat-persistence-"));

beforeAll(() => {
  process.env["HANOKI_USER_DATA_DIR"] = testDataDirectory;
  const db = getAppDatabase();
  db.run(
    sql.raw(`
    create table items (
      id text primary key,
      workspace_id text not null,
      folder_id text,
      type text not null,
      title text not null,
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
  db.run(
    sql.raw(`
    create table messages (
      id text primary key,
      item_id text not null references items(id) on delete cascade,
      parent_id text references messages(id) on delete set null,
      role text not null,
      parts text not null default '[]',
      data text not null default '{}',
      metadata text not null default '{}',
      extensions text not null default '{}',
      created_at integer not null,
      updated_at integer not null
    )
  `),
  );
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
  delete process.env["HANOKI_USER_DATA_DIR"];
});

describe("chat message persistence", () => {
  it("preserves an existing user message parent during regeneration", () => {
    createChatRow("regeneration-chat");
    seedMessage("root-user", "regeneration-chat", null, "user");
    seedMessage("first-assistant", "regeneration-chat", "root-user", "assistant");
    seedMessage("follow-up-user", "regeneration-chat", "first-assistant", "user", {
      pinned: true,
    });

    const requestMessages = [
      requestMessage("root-user", "user", null),
      requestMessage("first-assistant", "assistant", "root-user"),
      requestMessage("follow-up-user", "user", null),
    ];

    persistRequestUserMessage("regeneration-chat", requestMessages);
    persistGeneratedAssistantMessage({
      chatId: "regeneration-chat",
      message: requestMessage("regenerated-assistant", "assistant", "follow-up-user"),
      fallbackParentId: "follow-up-user",
      responseMetadata: undefined,
      modelId: "model",
    });

    expect(getMessageById("follow-up-user")).toEqual(
      expect.objectContaining({
        parentId: "first-assistant",
        metadata: expect.objectContaining({
          parentId: "first-assistant",
          pinned: true,
        }),
      }),
    );
    expect(
      listMessagesByChatId("regeneration-chat", getChatCurrentBranchId("regeneration-chat")),
    ).toMatchObject([
      { id: "root-user" },
      { id: "first-assistant" },
      { id: "follow-up-user" },
      { id: "regenerated-assistant" },
    ]);
  });

  it("keeps a resumed assistant response on its explicit branch", () => {
    createChatRow("resumed-chat");
    seedMessage("long-root-user", "resumed-chat", null, "user");
    seedMessage("long-first-assistant", "resumed-chat", "long-root-user", "assistant");
    seedMessage("long-follow-up-user", "resumed-chat", "long-first-assistant", "user");
    seedMessage("long-resumed-assistant", "resumed-chat", "long-follow-up-user", "assistant");
    seedMessage("newer-short-user", "resumed-chat", null, "user");
    seedMessage("newer-short-assistant", "resumed-chat", "newer-short-user", "assistant");
    setCreatedAt("long-root-user", 1);
    setCreatedAt("long-first-assistant", 2);
    setCreatedAt("long-follow-up-user", 3);
    setCreatedAt("long-resumed-assistant", 4);
    setCreatedAt("newer-short-user", 5);
    setCreatedAt("newer-short-assistant", 6);

    persistGeneratedAssistantMessage({
      chatId: "resumed-chat",
      message: requestMessage("long-resumed-assistant", "assistant", "long-follow-up-user"),
      fallbackParentId: "long-follow-up-user",
      responseMetadata: undefined,
      modelId: "model",
    });

    expect(getChatCurrentBranchId("resumed-chat")).toBe("long-resumed-assistant");
    expect(
      listMessagesByChatId("resumed-chat", getChatCurrentBranchId("resumed-chat")),
    ).toMatchObject([
      { id: "long-root-user" },
      { id: "long-first-assistant" },
      { id: "long-follow-up-user" },
      { id: "long-resumed-assistant" },
    ]);
  });
});

function createChatRow(id: string) {
  const now = Date.now();
  getAppDatabase().run(
    sql`insert into items (
      id,
      workspace_id,
      folder_id,
      type,
      title,
      data,
      metadata,
      extensions,
      created_at,
      updated_at
    ) values (
      ${id},
      'workspace',
      null,
      'chat',
      'Chat',
      '{"settings":{}}',
      '{}',
      '{}',
      ${now},
      ${now}
    )`,
  );
}

function seedMessage(
  id: string,
  chatId: string,
  parentId: string | null,
  role: "user" | "assistant",
  metadata: Record<string, unknown> = {},
) {
  upsertMessage({
    id,
    chatId,
    parentId,
    role,
    parts: [{ type: "text", text: id }],
    metadata: { ...metadata, parentId },
  });
}

function requestMessage(
  id: string,
  role: "user" | "assistant",
  parentId: string | null,
): HanokiUiMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text: id }],
    metadata: { parentId },
  };
}

function setCreatedAt(messageId: string, createdAt: number) {
  getAppDatabase().update(messages).set({ createdAt }).where(eq(messages.id, messageId)).run();
}
