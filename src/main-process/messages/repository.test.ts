import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeAppDatabase, getAppDatabase, initializeAppDatabase } from "../db/database";
import { messages } from "../db/schema";
import {
  deleteMessageSubtree,
  listAllMessagesByChatId,
  listMessagesByChatId,
  upsertMessage,
} from "./repository";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-messages-repo-"));

beforeAll(() => {
  process.env["HANOKI_USER_DATA_DIR"] = testDataDirectory;
  initializeAppDatabase();
  const db = getAppDatabase();
  const now = Date.now();
  db.run(
    sql`insert into workspaces (id, name, settings, data, metadata, extensions, created_at, updated_at)
      values ('ws', 'Workspace', '{}', '{}', '{}', '{}', ${now}, ${now})`,
  );
  db.run(
    sql`insert into items (id, workspace_id, folder_id, type, title, data, metadata, extensions, created_at, updated_at)
      values ('chat-1', 'ws', null, 'chat', 'Chat', '{"settings":{}}', '{}', '{}', ${now}, ${now})`,
  );
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
  delete process.env["HANOKI_USER_DATA_DIR"];
});

function seed(id: string, parentId: string | null, role: "user" | "assistant", createdAt: number) {
  upsertMessage({
    id,
    chatId: "chat-1",
    parentId,
    role,
    parts: [{ type: "text", text: `body-${id}` }],
    metadata: { parentId },
  });
  getAppDatabase().update(messages).set({ createdAt }).where(eq(messages.id, id)).run();
}

describe("messages repository branch queries", () => {
  it("loads only the active branch path with accurate sibling metadata", () => {
    seed("u1", null, "user", 1);
    seed("a1-old", "u1", "assistant", 2);
    seed("u2-old", "a1-old", "user", 3);
    seed("a1-new", "u1", "assistant", 4);
    seed("u2-new", "a1-new", "user", 5);

    const latestBranch = listMessagesByChatId("chat-1");
    expect(latestBranch.map((m) => m.id)).toEqual(["u1", "a1-new", "u2-new"]);
    expect(latestBranch[1]?.siblings).toEqual(["a1-old", "a1-new"]);
    expect(latestBranch[1]?.siblingIndex).toBe(1);

    const oldBranch = listMessagesByChatId("chat-1", "a1-old");
    expect(oldBranch.map((m) => m.id)).toEqual(["u1", "a1-old", "u2-old"]);
    expect(oldBranch[1]?.siblings).toEqual(["a1-old", "a1-new"]);
    expect(oldBranch[1]?.siblingIndex).toBe(0);
  });

  it("deletes a single branch subtree without affecting sibling branches", () => {
    const result = deleteMessageSubtree("a1-old", "message");
    expect(result.deletedIds).toEqual(new Set(["a1-old", "u2-old"]));
    expect(listAllMessagesByChatId("chat-1").map((m) => m.id)).toEqual(["u1", "a1-new", "u2-new"]);
  });
});
