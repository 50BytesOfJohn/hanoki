import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

type JsonObject = Record<string, unknown>;
const timestampMs = (columnName: string) =>
  integer(columnName)
    .notNull()
    .$defaultFn(() => Date.now());
const jsonObject = <T extends JsonObject = JsonObject>(columnName: string) =>
  text(columnName, { mode: "json" })
    .$type<T>()
    .notNull()
    .default(sql`'{}'`);
const jsonArray = <T extends unknown[] = unknown[]>(columnName: string) =>
  text(columnName, { mode: "json" })
    .$type<T>()
    .notNull()
    .default(sql`'[]'`);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  // JSON object stored as TEXT in SQLite (parsed by app code).
  settings: jsonObject("settings"),
  data: jsonObject("data"),
  metadata: jsonObject("metadata"),
  extensions: jsonObject("extensions"),
  createdAt: timestampMs("created_at"),
  updatedAt: timestampMs("updated_at"),
});

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => folders.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [
    index("folders_workspace_id_idx").on(table.workspaceId),
    index("folders_parent_id_idx").on(table.parentId),
  ],
);

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    settings: jsonObject("settings"),
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [
    index("chats_workspace_id_idx").on(table.workspaceId),
    index("chats_folder_id_idx").on(table.folderId),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnySQLiteColumn => messages.id, {
      onDelete: "set null",
    }),
    role: text("role").notNull(),
    parts: jsonArray("parts"),
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [
    index("messages_chat_id_idx").on(table.chatId),
    index("messages_parent_id_idx").on(table.parentId),
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    // Explicit workspace scope is required because files live in per-workspace asset directories.
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    chatId: text("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    // Path relative to the workspace asset directory identified by `workspace_id`.
    relativePath: text("relative_path").notNull(),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    createdAt: timestampMs("created_at"),
  },
  (table) => [
    index("assets_workspace_id_idx").on(table.workspaceId),
    index("assets_chat_id_idx").on(table.chatId),
    index("assets_message_id_idx").on(table.messageId),
  ],
);

/**
 * Provider profiles — app-global rows shared across workspaces.
 *
 * `catalogId` references the internal provider definition from the app catalog
 * (e.g. "openrouter"). The catalog handles mapping to the appropriate AI SDK.
 *
 * `baseUrl` is optional; used for self-hosted / custom-endpoint providers
 * (e.g. Ollama at http://localhost:11434).
 *
 * `config` holds provider-specific config as JSON, including encrypted secret
 * values for fields marked as `secret` in the provider catalog.
 *
 * Workspace-specific enable/disable state lives in `workspace_provider_overrides`.
 */
export const providers = sqliteTable(
  "providers",
  {
    id: text("id").primaryKey(),
    // Human-readable label chosen by the user (e.g. "My OpenRouter account").
    displayName: text("display_name").notNull(),
    // References a ProviderId from the app's provider catalog.
    catalogId: text("catalog_id").notNull(),
    // Optional base URL override (Ollama, LM Studio, custom OpenAI-compatible).
    baseUrl: text("base_url"),
    // Arbitrary provider-specific config stored as JSON (including encrypted secret wrappers).
    config: jsonObject("config"),
    data: jsonObject("data"),
    // Operational provider metadata (non-config), such as model sync diagnostics.
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    // Background model sync status for this provider profile.
    modelsSyncStatus: text("models_sync_status").notNull().default("idle"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [index("providers_catalog_id_idx").on(table.catalogId)],
);

export const models = sqliteTable(
  "models",
  {
    // App-wide unique model reference ID (used everywhere in our app).
    id: text("id").primaryKey(),
    // FK to the provider profile that owns this model entry.
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    // Provider-native model identifier used in API calls (e.g. "gpt-4o", "claude-3-5-sonnet-20241022").
    providerModelId: text("provider_model_id").notNull(),
    // Internal cross-provider identity for grouping semantically equivalent models.
    canonicalModelId: text("canonical_model_id").notNull(),
    displayName: text("display_name"),
    // App-wide enable/disable flag for this model.
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    // Workspace-specific enable/disable state lives in `workspace_model_overrides`.
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    lifecycleStatus: text("lifecycle_status").notNull().default("active"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [
    uniqueIndex("models_provider_model_unique").on(table.providerId, table.providerModelId),
    index("models_canonical_model_id_idx").on(table.canonicalModelId),
    index("models_provider_id_idx").on(table.providerId),
  ],
);

export const workspaceProviderOverrides = sqliteTable(
  "workspace_provider_overrides",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.providerId],
    }),
  ],
);

export const workspaceModelOverrides = sqliteTable(
  "workspace_model_overrides",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
    data: jsonObject("data"),
    metadata: jsonObject("metadata"),
    extensions: jsonObject("extensions"),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.modelId],
    }),
  ],
);
