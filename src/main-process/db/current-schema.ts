export const CURRENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  settings TEXT DEFAULT '{}' NOT NULL,
  data TEXT DEFAULT '{}' NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  extensions TEXT DEFAULT '{}' NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  data TEXT DEFAULT '{}' NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  extensions TEXT DEFAULT '{}' NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS folders_workspace_id_idx ON folders(workspace_id);
CREATE INDEX IF NOT EXISTS folders_parent_id_idx ON folders(parent_id);
CREATE TABLE IF NOT EXISTS items (
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
CREATE INDEX IF NOT EXISTS items_workspace_id_idx ON items(workspace_id);
CREATE INDEX IF NOT EXISTS items_folder_id_idx ON items(folder_id);
CREATE INDEX IF NOT EXISTS items_type_idx ON items(type);
CREATE TABLE IF NOT EXISTS messages (
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
CREATE INDEX IF NOT EXISTS messages_item_id_idx ON messages(item_id);
CREATE INDEX IF NOT EXISTS messages_parent_id_idx ON messages(parent_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE TABLE IF NOT EXISTS assets (
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
CREATE INDEX IF NOT EXISTS assets_workspace_id_idx ON assets(workspace_id);
CREATE INDEX IF NOT EXISTS assets_item_id_idx ON assets(item_id);
CREATE INDEX IF NOT EXISTS assets_message_id_idx ON assets(message_id);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  base_url TEXT,
  config TEXT DEFAULT '{}' NOT NULL,
  data TEXT DEFAULT '{}' NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  extensions TEXT DEFAULT '{}' NOT NULL,
  models_sync_status TEXT DEFAULT 'idle' NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS providers_catalog_id_idx ON providers(catalog_id);
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_model_id TEXT NOT NULL,
  canonical_model_id TEXT NOT NULL,
  display_name TEXT,
  is_enabled INTEGER DEFAULT 1 NOT NULL,
  data TEXT DEFAULT '{}' NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  extensions TEXT DEFAULT '{}' NOT NULL,
  lifecycle_status TEXT DEFAULT 'active' NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS models_provider_model_unique ON models(provider_id, provider_model_id);
CREATE INDEX IF NOT EXISTS models_canonical_model_id_idx ON models(canonical_model_id);
CREATE INDEX IF NOT EXISTS models_provider_id_idx ON models(provider_id);
CREATE TABLE IF NOT EXISTS workspace_provider_overrides (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  is_enabled INTEGER NOT NULL,
  data TEXT DEFAULT '{}' NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  extensions TEXT DEFAULT '{}' NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id, provider_id)
);
CREATE TABLE IF NOT EXISTS workspace_model_overrides (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  is_enabled INTEGER NOT NULL,
  data TEXT DEFAULT '{}' NOT NULL,
  metadata TEXT DEFAULT '{}' NOT NULL,
  extensions TEXT DEFAULT '{}' NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id, model_id)
);
`;
