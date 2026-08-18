import { constants, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function defaultDatabasePath() {
  if (process.env.HANOKI_USER_DATA_DIR) {
    return path.join(process.env.HANOKI_USER_DATA_DIR, "app.sqlite");
  }
  const appData =
    process.platform === "darwin"
      ? path.join(homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? (process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"))
        : (process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"));
  return path.join(appData, "com.hanoki.app", "data-dev", "app.sqlite");
}

function transformLayout(node) {
  if (!node || typeof node !== "object") return node;
  if (node.type === "pane") {
    const { chatId, ...rest } = node;
    return { ...rest, itemId: chatId, itemType: "chat" };
  }
  if (node.type === "split" && Array.isArray(node.children)) {
    return { ...node, children: node.children.map(transformLayout) };
  }
  return node;
}

const dbPath = path.resolve(process.argv[2] ?? defaultDatabasePath());
if (!existsSync(dbPath)) throw new Error(`Hanoki database not found at ${dbPath}`);

let database = new DatabaseSync(dbPath, { timeout: 5_000 });
const tables = new Set(
  database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name)),
);
if (tables.has("items")) {
  database.close();
  console.log(`Already converted: ${dbPath}`);
  process.exit(0);
}
if (!tables.has("chats")) {
  database.close();
  throw new Error("The database has neither a chats table nor an items table.");
}

const checkpoint = database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
if (Number(checkpoint.busy) !== 0) {
  database.close();
  throw new Error("Hanoki is using the database. Quit the app and run this script again.");
}
database.close();

const stamp = new Date().toISOString().replaceAll(":", "-");
const backupPath = `${dbPath}.pre-items-${stamp}.bak`;
copyFileSync(dbPath, backupPath, constants.COPYFILE_EXCL);

database = new DatabaseSync(dbPath, { timeout: 5_000 });
database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");

try {
  database.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('chat', 'terminal')),
      title TEXT NOT NULL,
      data TEXT DEFAULT '{}' NOT NULL,
      metadata TEXT DEFAULT '{}' NOT NULL,
      extensions TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO items
      (id, workspace_id, folder_id, type, title, data, metadata, extensions, created_at, updated_at)
    SELECT id, workspace_id, folder_id, 'chat', title,
      json_set(
        CASE WHEN json_valid(data) THEN data ELSE '{}' END,
        '$.settings',
        json(CASE WHEN json_valid(settings) THEN settings ELSE '{}' END)
      ),
      metadata, extensions, created_at, updated_at
    FROM chats;
    CREATE INDEX items_workspace_id_idx ON items(workspace_id);
    CREATE INDEX items_folder_id_idx ON items(folder_id);
    CREATE INDEX items_type_idx ON items(type);

    DROP INDEX IF EXISTS messages_chat_id_idx;
    DROP INDEX IF EXISTS messages_parent_id_idx;
    DROP INDEX IF EXISTS messages_created_at_idx;
    ALTER TABLE messages RENAME TO messages_legacy;
    CREATE TABLE messages (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      role TEXT NOT NULL,
      parts TEXT DEFAULT '[]' NOT NULL,
      data TEXT DEFAULT '{}' NOT NULL,
      metadata TEXT DEFAULT '{}' NOT NULL,
      extensions TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO messages SELECT id, chat_id, parent_id, role, parts, data, metadata, extensions, created_at, updated_at FROM messages_legacy;
    CREATE INDEX messages_item_id_idx ON messages(item_id);
    CREATE INDEX messages_parent_id_idx ON messages(parent_id);
    CREATE INDEX messages_created_at_idx ON messages(created_at);

    DROP INDEX IF EXISTS assets_workspace_id_idx;
    DROP INDEX IF EXISTS assets_chat_id_idx;
    DROP INDEX IF EXISTS assets_message_id_idx;
    ALTER TABLE assets RENAME TO assets_legacy;
    CREATE TABLE assets (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      data TEXT DEFAULT '{}' NOT NULL,
      metadata TEXT DEFAULT '{}' NOT NULL,
      extensions TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO assets SELECT id, workspace_id, chat_id, message_id, kind, mime_type, relative_path, size_bytes, width, height, duration_ms, data, metadata, extensions, created_at FROM assets_legacy;
    CREATE INDEX assets_workspace_id_idx ON assets(workspace_id);
    CREATE INDEX assets_item_id_idx ON assets(item_id);
    CREATE INDEX assets_message_id_idx ON assets(message_id);
  `);

  const readWorkspaces = database.prepare("SELECT id, settings FROM workspaces").all();
  const writeSettings = database.prepare("UPDATE workspaces SET settings = ? WHERE id = ?");
  for (const row of readWorkspaces) {
    const settings = JSON.parse(String(row.settings));
    if (Array.isArray(settings.tabs)) {
      settings.tabs = settings.tabs.map((tab) => ({
        ...tab,
        type: "item",
        layout: transformLayout(tab.layout),
      }));
      writeSettings.run(JSON.stringify(settings), row.id);
    }
  }

  database.exec(`
    DROP TABLE assets_legacy;
    DROP TABLE messages_legacy;
    DROP TABLE chats;
    DROP TABLE IF EXISTS __drizzle_migrations;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0)
    throw new Error(`Foreign key check failed: ${JSON.stringify(violations)}`);
  database.close();
  console.log(`Converted: ${dbPath}`);
  console.log(`Backup:    ${backupPath}`);
} catch (error) {
  try {
    database.exec("ROLLBACK;");
  } catch {
    // The transaction may already be closed.
  }
  database.close();
  throw error;
}
