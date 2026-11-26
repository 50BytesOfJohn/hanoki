import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getUserDataDirectory, isPackagedElectronApp } from "../system/paths";
import { drizzle, type NodeSQLiteDatabase } from "./node-sqlite-drizzle";
import * as schema from "./schema";

export type AppDatabase = NodeSQLiteDatabase<typeof schema>;

const APP_DATABASE_FILENAME = "app.sqlite";
const MIGRATIONS_TABLE = "__drizzle_migrations";
let connection: { sqlite: DatabaseSync; db: AppDatabase } | null = null;

function openDatabase(dbPath: string): { sqlite: DatabaseSync; db: AppDatabase } {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new DatabaseSync(dbPath, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
  });
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA synchronous = NORMAL;"); // Safe with WAL, much faster than FULL
  sqlite.exec("PRAGMA cache_size = -20000;"); // 20 MB page cache
  sqlite.exec("PRAGMA temp_store = MEMORY;"); // Temp tables and indices in memory

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getAppDatabasePath(): string {
  return join(getUserDataDirectory(), APP_DATABASE_FILENAME);
}

function getMigrationsDirectory(): string {
  if (process.env["HANOKI_MIGRATIONS_DIR"]) {
    return process.env["HANOKI_MIGRATIONS_DIR"];
  }
  return isPackagedElectronApp()
    ? join(process.resourcesPath, "migrations")
    : join(process.cwd(), "src/main-process/db/migrations");
}

export function initializeAppDatabase(): void {
  closeAppDatabase();
  const opened = openDatabase(getAppDatabasePath());
  const { sqlite, db } = opened;

  try {
    const tableNames = new Set(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    if (tableNames.has("chats")) {
      throw new Error(
        "This database still uses the pre-items schema. Run scripts/tmp-migrate-chats-to-items.mjs once, then reopen Hanoki.",
      );
    }

    const baselineExistingDatabase = tableNames.has("items") && !tableNames.has(MIGRATIONS_TABLE);

    let didApplyMigrations = false;
    sqlite.exec("PRAGMA foreign_keys = OFF;");
    try {
      didApplyMigrations = db.migrate(
        { migrationsFolder: getMigrationsDirectory() },
        baselineExistingDatabase,
      );
    } finally {
      sqlite.exec("PRAGMA foreign_keys = ON;");
    }

    // `PRAGMA foreign_key_check` scans every row of every table with foreign keys.
    // Run it only when migrations actually mutated the schema (foreign_keys = ON
    // enforces referential integrity during normal operation).
    if (didApplyMigrations) {
      const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(
          `Database migration introduced foreign key violations: ${violations.length}.`,
        );
      }
    }

    // Keep the initialized connection as the long-lived singleton instead of
    // closing it and immediately reopening SQLite + WAL on the next query.
    connection = opened;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

/**
 * Returns the long-lived app database connection, opening it on first access.
 * Reuse this for all IPC query handlers.
 */
export function getAppDatabase(): AppDatabase {
  if (!connection) {
    connection = openDatabase(getAppDatabasePath());
  }
  return connection.db;
}

/**
 * Closes the app SQLite connection. Call this from the `will-quit`
 * app event to ensure WAL checkpointing completes cleanly.
 */
export function closeAppDatabase(): void {
  if (connection) {
    try {
      connection.sqlite.exec("PRAGMA optimize;");
    } catch {
      // Best-effort planner statistics refresh on shutdown.
    }
    connection.sqlite.close();
    connection = null;
  }
}
