import { sql } from "drizzle-orm";

import { getAppDatabase } from "./database";

const SQLITE_MAX_VARIABLE_NUMBER_FALLBACK = 999;

let sqliteMaxVariableNumberCache: number | undefined;

export function sqliteMaxVariableNumber(): number {
  if (sqliteMaxVariableNumberCache !== undefined) return sqliteMaxVariableNumberCache;
  const rows = getAppDatabase().all<{ compile_options: string }>(sql`PRAGMA compile_options`);
  for (const row of rows) {
    const match = /^MAX_VARIABLE_NUMBER=(\d+)$/.exec(row.compile_options);
    if (!match?.[1]) continue;
    sqliteMaxVariableNumberCache = Number(match[1]);
    return sqliteMaxVariableNumberCache;
  }
  sqliteMaxVariableNumberCache = SQLITE_MAX_VARIABLE_NUMBER_FALLBACK;
  return sqliteMaxVariableNumberCache;
}
