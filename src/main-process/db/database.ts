import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { SQLiteSyncDialect } from "drizzle-orm/sqlite-core/dialect";

import { getUserDataDirectory } from "../system/paths";
import { drizzle, type NodeSQLiteDatabase } from "./node-sqlite-drizzle";
import * as schema from "./schema";

export type AppDatabase = NodeSQLiteDatabase<typeof schema>;

const _require = createRequire(__filename);
const APP_DATABASE_FILENAME = "app.sqlite";
let connection: { sqlite: DatabaseSync; db: AppDatabase } | null = null;

function resolveMigrationsFolder(): string {
  if (process.versions.electron) {
    const { app } = _require("electron") as typeof import("electron");

    if (app.isPackaged) {
      // Packaged Electron app — migrations come from extraResource in forge.config.ts.
      return join(process.resourcesPath, "migrations");
    }

    // Development Electron — app.getAppPath() is the reliable project root
    // (process.cwd() can shift depending on how the process was launched).
    return join(app.getAppPath(), "src", "main-process", "db", "migrations");
  }

  // CLI (studio) or any non-Electron context.
  return join(process.cwd(), "src", "main-process", "db", "migrations");
}

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

export function migrateAppDatabase(): void {
  const { sqlite, db } = openDatabase(getAppDatabasePath());

  try {
    const migrationsFolder = resolveMigrationsFolder();
    const migrations = readMigrationFiles({ migrationsFolder });
    const migrationDb = db as unknown as {
      dialect: SQLiteSyncDialect;
      session: Parameters<SQLiteSyncDialect["migrate"]>[1];
    };

    migrationDb.dialect.migrate(migrations, migrationDb.session, { migrationsFolder });
  } finally {
    sqlite.close();
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
 * Closes the app SQLite connection. Call this from the `before-quit`
 * app event to ensure WAL checkpointing completes cleanly.
 */
export function closeAppDatabase(): void {
  if (connection) {
    connection.sqlite.close();
    connection = null;
  }
}
