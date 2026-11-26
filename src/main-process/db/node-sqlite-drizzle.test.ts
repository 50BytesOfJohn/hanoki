import { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { drizzle } from "./node-sqlite-drizzle";
import * as schema from "./schema";

function createInMemoryDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      settings TEXT NOT NULL DEFAULT '{}',
      data TEXT NOT NULL DEFAULT '{}',
      metadata TEXT NOT NULL DEFAULT '{}',
      extensions TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

describe("NodeSQLiteSession prepared statement cache", () => {
  it("reuses prepared statements across repeated queries", () => {
    const { sqlite, db } = createInMemoryDb();
    const prepareSpy = vi.spyOn(sqlite, "prepare");

    db.insert(schema.workspaces)
      .values({ id: "ws-1", name: "One", createdAt: 1, updatedAt: 1 })
      .run();
    db.insert(schema.workspaces)
      .values({ id: "ws-2", name: "Two", createdAt: 2, updatedAt: 2 })
      .run();

    const insertCalls = prepareSpy.mock.calls.filter(([sql]) =>
      sql.toLowerCase().startsWith("insert into"),
    );
    expect(insertCalls).toHaveLength(1);

    const first = db.select().from(schema.workspaces).where(eq(schema.workspaces.id, "ws-1")).get();
    const second = db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, "ws-2"))
      .get();

    const selectCalls = prepareSpy.mock.calls.filter(([sql]) =>
      sql.toLowerCase().includes('from "workspaces" where'),
    );
    expect(selectCalls).toHaveLength(1);
    expect(first?.name).toBe("One");
    expect(second?.name).toBe("Two");

    sqlite.close();
  });

  it("returns consistent rows across get and all using the same cached statement", () => {
    const { sqlite, db } = createInMemoryDb();

    db.insert(schema.workspaces)
      .values({ id: "ws-1", name: "Alpha", createdAt: 1, updatedAt: 1 })
      .run();

    const single = db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, "ws-1"))
      .get();
    const list = db.select().from(schema.workspaces).where(eq(schema.workspaces.id, "ws-1")).all();

    expect(single?.name).toBe("Alpha");
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Alpha");

    sqlite.close();
  });
});
