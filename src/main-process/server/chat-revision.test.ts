import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { REVISION_NOTE_MAX_LENGTH } from "@shared/chat/revision";

import { closeAppDatabase, getAppDatabase } from "../db/database";
import { upsertMessage } from "../messages/repository";
import { resolveRevisionContext } from "./chat-revision";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-chat-revision-"));
const chat = { id: "chat" };

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
  for (const id of ["chat", "other-chat"]) {
    db.run(
      sql`insert into items (id, workspace_id, type, title, created_at, updated_at)
          values (${id}, 'workspace', 'chat', 'Chat', 0, 0)`,
    );
  }

  seed("user-1", "chat", null, "user");
  seed("answer", "chat", "user-1", "assistant");
  seed("user-2", "chat", "answer", "user");
  seed("later-answer", "chat", "user-2", "assistant");
  seed("other-answer", "other-chat", null, "assistant");
  seed("revised", "chat", "user-1", "assistant", {
    sourceMessageId: "deleted-answer",
    note: "Shorter.",
    sourceText: "Snapshot of the deleted answer.",
  });
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
  delete process.env["HANOKI_USER_DATA_DIR"];
});

describe("resolveRevisionContext", () => {
  it("returns the source text and trimmed note for a fresh revision", () => {
    expect(resolve({ sourceMessageId: "answer", note: "  Shorter.  " })).toEqual({
      ok: true,
      revision: { sourceMessageId: "answer", note: "Shorter.", sourceText: "answer text" },
    });
  });

  it("returns no revision for a plain request", () => {
    expect(resolveRevisionContext({ ...freshInput(), body: {} })).toEqual({
      ok: true,
      revision: null,
    });
  });

  it.each([
    ["another chat", { sourceMessageId: "other-answer", note: "x" }],
    ["a user message", { sourceMessageId: "user-1", note: "x" }],
    ["a non-sibling", { sourceMessageId: "later-answer", note: "x" }],
    ["an empty note", { sourceMessageId: "answer", note: "   " }],
    [
      "a too-long note",
      { sourceMessageId: "answer", note: "x".repeat(REVISION_NOTE_MAX_LENGTH + 1) },
    ],
  ])("rejects %s", (_label, revision) => {
    expect(resolve(revision)).toMatchObject({ ok: false });
  });

  it("rejects a revision outside a regenerate request", () => {
    const revision = { sourceMessageId: "answer", note: "x" };
    expect(
      resolveRevisionContext({
        ...freshInput(),
        body: { trigger: "submit-message", revision },
      }),
    ).toMatchObject({ ok: false });
    expect(
      resolveRevisionContext({
        ...freshInput(),
        mode: "continue-message",
        body: { trigger: "regenerate-message", revision },
      }),
    ).toMatchObject({ ok: false });
  });

  it("falls back to the regenerated revision's snapshot when the original is gone", () => {
    expect(
      resolve({ sourceMessageId: "deleted-answer", note: "Even shorter." }, "revised"),
    ).toEqual({
      ok: true,
      revision: {
        sourceMessageId: "deleted-answer",
        note: "Even shorter.",
        sourceText: "Snapshot of the deleted answer.",
      },
    });
  });

  it("rejects a missing original whose snapshot belongs to another source", () => {
    expect(resolve({ sourceMessageId: "missing", note: "x" }, "revised")).toEqual({
      ok: false,
      error: "The original message is no longer available.",
    });
  });

  it("reuses the saved revision when a tool approval resumes it", () => {
    const messages = [requestMessage("user-1", "user"), requestMessage("revised", "assistant")];

    expect(
      resolveRevisionContext({
        chat,
        body: { trigger: "submit-message" },
        messages,
        mode: "default",
        responseParentId: "user-1",
      }),
    ).toEqual({
      ok: true,
      revision: {
        sourceMessageId: "deleted-answer",
        note: "Shorter.",
        sourceText: "Snapshot of the deleted answer.",
      },
    });
  });

  it("reuses the saved revision when a mid-stream approval re-sends the original body", () => {
    const messages = [requestMessage("user-1", "user"), requestMessage("revised", "assistant")];

    expect(
      resolveRevisionContext({
        chat,
        body: {
          trigger: "submit-message",
          revision: { sourceMessageId: "deleted-answer", note: "Shorter." },
        },
        messages,
        mode: "default",
        responseParentId: "user-1",
      }),
    ).toEqual({
      ok: true,
      revision: {
        sourceMessageId: "deleted-answer",
        note: "Shorter.",
        sourceText: "Snapshot of the deleted answer.",
      },
    });
  });

  it("does not apply revision context to a continuation", () => {
    const messages = [requestMessage("user-1", "user"), requestMessage("revised", "assistant")];

    expect(
      resolveRevisionContext({
        chat,
        body: {},
        messages,
        mode: "continue-message",
        responseParentId: "user-1",
      }),
    ).toEqual({ ok: true, revision: null });
  });
});

function freshInput() {
  return {
    chat,
    messages: [requestMessage("user-1", "user")],
    mode: "default" as const,
    responseParentId: "user-1",
  };
}

function resolve(revision: unknown, messageId = "answer") {
  return resolveRevisionContext({
    ...freshInput(),
    body: { trigger: "regenerate-message", messageId, revision },
  });
}

function seed(
  id: string,
  chatId: string,
  parentId: string | null,
  role: "user" | "assistant",
  revision?: { sourceMessageId: string; note: string; sourceText: string },
) {
  upsertMessage({
    id,
    chatId,
    parentId,
    role,
    parts: [{ type: "text", text: `${id} text` }],
    metadata: { parentId, ...(revision && { revision }) },
  });
}

function requestMessage(id: string, role: "user" | "assistant"): HanokiUiMessage {
  return { id, role, parts: [{ type: "text", text: `${id} text` }], metadata: { parentId: null } };
}
