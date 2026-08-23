import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { getAppDatabasePath, initializeAppDatabase } from "./database";

const migrationsDirectory = resolve("src/main-process/db/migrations");
const testDirectories: string[] = [];

function useTestDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), "hanoki-database-migration-"));
  testDirectories.push(directory);
  process.env["HANOKI_USER_DATA_DIR"] = directory;
  process.env["HANOKI_MIGRATIONS_DIR"] = migrationsDirectory;
  return getAppDatabasePath();
}

function applyBaselineSchema(databasePath: string): void {
  const sqlite = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
  const baselineSql = readFileSync(join(migrationsDirectory, "0000_items_baseline.sql"), "utf8");
  sqlite.exec(baselineSql.replaceAll("--> statement-breakpoint", ""));
  sqlite.close();
}

function migrationCount(sqlite: DatabaseSync): number {
  const row = sqlite.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get();
  return Number(row?.count ?? 0);
}

afterEach(() => {
  delete process.env["HANOKI_USER_DATA_DIR"];
  delete process.env["HANOKI_MIGRATIONS_DIR"];
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.sequential("initializeAppDatabase", () => {
  it("applies every generated migration to a fresh database once", () => {
    const databasePath = useTestDatabase();

    initializeAppDatabase();
    initializeAppDatabase();

    const sqlite = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    const itemsSql = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
      .get();

    expect(String(itemsSql?.sql)).toContain("'markdown'");
    expect(migrationCount(sqlite)).toBe(2);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    sqlite
      .prepare("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("workspace", "Workspace", 1, 1);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO items (id, workspace_id, type, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("markdown", "workspace", "markdown", "Markdown", '{"markdown":""}', 1, 1),
    ).not.toThrow();
    sqlite.close();
  });

  it("baselines an existing items database and preserves related records", () => {
    const databasePath = useTestDatabase();
    applyBaselineSchema(databasePath);

    const legacy = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    legacy
      .prepare("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("workspace", "Workspace", 1, 1);
    legacy
      .prepare(
        "INSERT INTO items (id, workspace_id, type, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("chat", "workspace", "chat", "Chat", 1, 1);
    legacy
      .prepare(
        "INSERT INTO messages (id, item_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("message", "chat", "user", 1, 1);
    legacy
      .prepare(
        "INSERT INTO assets (id, workspace_id, item_id, message_id, kind, mime_type, relative_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("asset", "workspace", "chat", "message", "file", "text/plain", "asset.txt", 1);
    legacy.close();

    initializeAppDatabase();
    initializeAppDatabase();

    const migrated = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    const itemsSql = migrated
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
      .get();

    expect(String(itemsSql?.sql)).toContain("'markdown'");
    expect(migrationCount(migrated)).toBe(2);
    expect(migrated.prepare("SELECT type FROM items WHERE id = 'chat'").get()).toEqual({
      type: "chat",
    });
    expect(migrated.prepare("SELECT item_id FROM messages WHERE id = 'message'").get()).toEqual({
      item_id: "chat",
    });
    expect(
      migrated.prepare("SELECT item_id, message_id FROM assets WHERE id = 'asset'").get(),
    ).toEqual({ item_id: "chat", message_id: "message" });
    expect(migrated.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    expect(() =>
      migrated
        .prepare(
          "INSERT INTO items (id, workspace_id, type, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("markdown", "workspace", "markdown", "Markdown", '{"markdown":"# Hello"}', 2, 2),
    ).not.toThrow();
    migrated.close();
  });
});
