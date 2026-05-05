import { asc, eq } from "drizzle-orm";

import { getAppDatabase } from "../db/database";
import { providers } from "../db/schema";

export type ProviderTableRow = typeof providers.$inferSelect;
export type ProviderModelsSyncStatus = "idle" | "syncing" | "succeeded" | "failed";

interface ProviderModelSyncMetadata {
  error?: string | null;
  started_at?: number | null;
  ended_at?: number | null;
  duration?: number | null;
}

interface ProviderMetadata {
  model_sync?: ProviderModelSyncMetadata;
  [key: string]: unknown;
}

interface CreateProviderInput {
  id: string;
  displayName: string;
  catalogId: string;
  baseUrl?: string | null;
  config?: Record<string, unknown>;
}

export function listProviders(): ProviderTableRow[] {
  return getAppDatabase().select().from(providers).orderBy(asc(providers.createdAt)).all();
}

export function getProviderById(id: string): ProviderTableRow | null {
  return getAppDatabase().select().from(providers).where(eq(providers.id, id)).get() ?? null;
}

export function createProvider(input: CreateProviderInput): ProviderTableRow {
  getAppDatabase()
    .insert(providers)
    .values({
      id: input.id,
      displayName: input.displayName,
      catalogId: input.catalogId,
      baseUrl: input.baseUrl ?? null,
      config: input.config ?? {},
    })
    .run();

  const created = getProviderById(input.id);
  if (!created) {
    throw new Error(`Failed to create provider "${input.id}".`);
  }
  return created;
}

export function deleteProvider(id: string): void {
  getAppDatabase().delete(providers).where(eq(providers.id, id)).run();
}

export function updateProviderModelsSyncStatus(
  id: string,
  status: ProviderModelsSyncStatus,
): boolean {
  const result = getAppDatabase()
    .update(providers)
    .set({
      modelsSyncStatus: status,
      updatedAt: Date.now(),
    })
    .where(eq(providers.id, id))
    .run();

  return result.changes > 0;
}

export function updateProviderMetadataModelSync(
  id: string,
  patch: Partial<ProviderModelSyncMetadata>,
): boolean {
  const row = getProviderById(id);
  if (!row) {
    return false;
  }

  const metadata = parseProviderMetadata(row.metadata);
  const currentModelSync =
    metadata.model_sync && isPlainObject(metadata.model_sync) ? metadata.model_sync : {};
  const nextModelSync: ProviderModelSyncMetadata = { ...currentModelSync };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    switch (key) {
      case "error":
        nextModelSync.error = typeof value === "string" || value === null ? value : null;
        break;
      case "started_at":
        nextModelSync.started_at = typeof value === "number" || value === null ? value : null;
        break;
      case "ended_at":
        nextModelSync.ended_at = typeof value === "number" || value === null ? value : null;
        break;
      case "duration":
        nextModelSync.duration = typeof value === "number" || value === null ? value : null;
        break;
    }
  }

  metadata.model_sync = nextModelSync;

  const result = getAppDatabase()
    .update(providers)
    .set({
      metadata,
      updatedAt: Date.now(),
    })
    .where(eq(providers.id, id))
    .run();

  return result.changes > 0;
}

function parseProviderMetadata(raw: unknown): ProviderMetadata {
  if (!isPlainObject(raw)) {
    return {};
  }

  return raw as ProviderMetadata;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
