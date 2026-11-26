import type { DatabaseSync, StatementResultingChanges, StatementSync } from "node:sqlite";
import { entityKind } from "drizzle-orm/entity";
import { DefaultLogger, NoopLogger, type Logger } from "drizzle-orm/logger";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  type RelationalSchemaConfig,
  type TablesRelationalConfig,
} from "drizzle-orm/relations";
import { fillPlaceholders, sql, type Query } from "drizzle-orm/sql";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core/dialect";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { SelectedFieldsOrdered } from "drizzle-orm/sqlite-core/query-builders/select.types";
import {
  SQLitePreparedQuery,
  SQLiteSession,
  type PreparedQueryConfig as PreparedQueryConfigBase,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
} from "drizzle-orm/sqlite-core/session";
import type { DrizzleConfig } from "drizzle-orm/utils";
import * as drizzleUtils from "drizzle-orm/utils";
import { readMigrationFiles, type MigrationConfig, type MigrationMeta } from "drizzle-orm/migrator";

const mapResultRow = (
  drizzleUtils as unknown as {
    mapResultRow: (
      fields: SelectedFieldsOrdered,
      row: unknown[],
      joinsNotNullableMap: Record<string, boolean> | undefined,
    ) => unknown;
  }
).mapResultRow;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, "statement" | "run">;

const STATEMENT_CACHE_MAX_SIZE = 256;
const CACHEABLE_SQL_PREFIX =
  /^(?:select|insert|update|delete|with|replace|begin|commit|rollback)\b/i;

export class NodeSQLiteDatabase<
  TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<"sync", StatementResultingChanges, TSchema> {
  static readonly [entityKind]: string = "NodeSQLiteDatabase";

  migrate(config: MigrationConfig, baselineExistingDatabase = false): boolean {
    const { dialect, session } = this as unknown as {
      dialect: SQLiteSyncDialect;
      session: NodeSQLiteSession<Record<string, unknown>, TablesRelationalConfig>;
    };
    const migrations = readMigrationFiles(config);
    const migrationsTable = config.migrationsTable ?? "__drizzle_migrations";
    const beforeCount = session.getAppliedMigrationCount(migrationsTable);

    if (baselineExistingDatabase) {
      const baselineMigration = migrations[0];
      if (!baselineMigration) {
        throw new Error("No migrations exist to baseline.");
      }
      const marker: MigrationMeta = { ...baselineMigration, sql: [] };
      dialect.migrate([marker], session, config);
    }
    dialect.migrate(migrations, session, config);
    session.clearStatementCache();

    const afterCount = session.getAppliedMigrationCount(migrationsTable);
    return baselineExistingDatabase || afterCount > beforeCount;
  }
}

class NodeSQLiteSession<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteSession<"sync", StatementResultingChanges, TFullSchema, TSchema> {
  static readonly [entityKind]: string = "NodeSQLiteSession";

  private readonly logger: Logger;
  private readonly statementCache = new Map<string, StatementSync>();

  constructor(
    private readonly client: DatabaseSync,
    dialect: SQLiteSyncDialect,
    private readonly schema: RelationalSchemaConfig<TSchema> | undefined,
    options: { logger?: Logger } = {},
  ) {
    super(dialect);
    this.logger = options.logger ?? new NoopLogger();
  }

  private getPreparedStatement(sqlText: string): StatementSync {
    if (!CACHEABLE_SQL_PREFIX.test(sqlText.trimStart())) {
      return this.client.prepare(sqlText);
    }

    const cached = this.statementCache.get(sqlText);
    if (cached) {
      // Refresh recency for LRU eviction.
      this.statementCache.delete(sqlText);
      this.statementCache.set(sqlText, cached);
      return cached;
    }

    const stmt = this.client.prepare(sqlText);
    if (this.statementCache.size >= STATEMENT_CACHE_MAX_SIZE) {
      const oldestKey = this.statementCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.statementCache.delete(oldestKey);
      }
    }
    this.statementCache.set(sqlText, stmt);
    return stmt;
  }

  clearStatementCache(): void {
    this.statementCache.clear();
  }

  getAppliedMigrationCount(migrationsTable: string): number {
    const tableExists = this.client
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(migrationsTable);
    if (!tableExists) {
      return 0;
    }

    const safeIdentifier = migrationsTable.replaceAll('"', '""');
    const row = this.client.prepare(`SELECT count(*) AS count FROM "${safeIdentifier}"`).get() as
      | { count?: number }
      | undefined;
    return typeof row?.count === "number" ? row.count : 0;
  }

  prepareQuery<T extends Omit<PreparedQueryConfig, "run">>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
  ): NodeSQLitePreparedQuery<T> {
    return new NodeSQLitePreparedQuery(
      this.getPreparedStatement(query.sql),
      query,
      this.logger,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
    );
  }

  transaction<T>(
    transaction: (tx: NodeSQLiteTransaction<TFullSchema, TSchema>) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new NodeSQLiteTransaction(
      "sync",
      (this as unknown as { dialect: SQLiteSyncDialect }).dialect,
      this,
      this.schema,
    );
    this.run(sql.raw(`begin ${config.behavior ?? "deferred"}`));

    try {
      const result = transaction(tx);
      this.run(sql`commit`);
      return result;
    } catch (error) {
      this.run(sql`rollback`);
      throw error;
    }
  }
}

class NodeSQLiteTransaction<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<"sync", StatementResultingChanges, TFullSchema, TSchema> {
  static readonly [entityKind]: string = "NodeSQLiteTransaction";

  transaction<T>(transaction: (tx: NodeSQLiteTransaction<TFullSchema, TSchema>) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new NodeSQLiteTransaction(
      "sync",
      (this as unknown as { dialect: SQLiteSyncDialect }).dialect,
      (this as unknown as { session: NodeSQLiteSession<TFullSchema, TSchema> }).session,
      this.schema,
      this.nestedIndex + 1,
    );

    const session = (this as unknown as { session: NodeSQLiteSession<TFullSchema, TSchema> })
      .session;

    session.run(sql.raw(`savepoint ${savepointName}`));

    try {
      const result = transaction(tx);
      session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (error) {
      session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw error;
    }
  }
}

class NodeSQLitePreparedQuery<
  T extends PreparedQueryConfig = PreparedQueryConfig,
> extends SQLitePreparedQuery<{
  type: "sync";
  run: StatementResultingChanges;
  all: T["all"];
  get: T["get"];
  values: T["values"];
  execute: T["execute"];
}> {
  static readonly [entityKind]: string = "NodeSQLitePreparedQuery";

  constructor(
    private readonly stmt: StatementSync,
    query: Query,
    private readonly logger: Logger,
    private readonly fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private readonly responseInArrayMode: boolean,
    private readonly customResultMapper?: (rows: unknown[][]) => unknown,
  ) {
    super("sync", executeMethod, query);
  }

  run(placeholderValues?: Record<string, unknown>): StatementResultingChanges {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.run(...(params as Parameters<StatementSync["run"]>));
  }

  all(placeholderValues?: Record<string, unknown>): T["all"] {
    if (!this.fields && !this.customResultMapper) {
      const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
      this.logger.logQuery(this.query.sql, params);
      this.stmt.setReturnArrays(false);
      return this.stmt.all(...(params as Parameters<StatementSync["all"]>)) as T["all"];
    }

    const rows = this.values(placeholderValues);

    if (this.customResultMapper) {
      return this.customResultMapper(rows as unknown[][]) as T["all"];
    }

    return (rows as unknown[][]).map((row) =>
      mapResultRow(
        this.fields!,
        row,
        (this as unknown as { joinsNotNullableMap: Record<string, boolean> | undefined })
          .joinsNotNullableMap,
      ),
    ) as T["all"];
  }

  get(placeholderValues?: Record<string, unknown>): T["get"] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);

    if (!this.fields && !this.customResultMapper) {
      this.stmt.setReturnArrays(false);
      return this.stmt.get(...(params as Parameters<StatementSync["get"]>)) as T["get"];
    }

    this.stmt.setReturnArrays(true);
    const row = this.stmt.get(...(params as Parameters<StatementSync["get"]>)) as
      | unknown[]
      | undefined;

    if (!row) {
      return undefined as T["get"];
    }

    if (this.customResultMapper) {
      return this.customResultMapper([row]) as T["get"];
    }

    return mapResultRow(
      this.fields!,
      row,
      (this as unknown as { joinsNotNullableMap: Record<string, boolean> | undefined })
        .joinsNotNullableMap,
    ) as T["get"];
  }

  values(placeholderValues?: Record<string, unknown>): T["values"] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    this.stmt.setReturnArrays(true);
    return this.stmt.all(...(params as Parameters<StatementSync["all"]>)) as T["values"];
  }

  isResponseInArrayMode(): boolean {
    return this.responseInArrayMode;
  }
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
  client: DatabaseSync,
  config: DrizzleConfig<TSchema> = {},
): NodeSQLiteDatabase<TSchema> & { $client: DatabaseSync } {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  const logger =
    config.logger === true
      ? new DefaultLogger()
      : config.logger === false
        ? undefined
        : config.logger;

  let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;

  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new NodeSQLiteSession(client, dialect, schema, { logger });
  const db = new NodeSQLiteDatabase(
    "sync",
    dialect,
    session,
    schema,
  ) as NodeSQLiteDatabase<TSchema> & {
    $client: DatabaseSync;
  };

  db.$client = client;

  return db;
}
