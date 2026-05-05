import { and, asc, eq, inArray } from "drizzle-orm";

import { getAppDatabase } from "../db/database";
import { models } from "../db/schema";

export type ModelTableRow = typeof models.$inferSelect;
export type ModelLifecycleStatus = "active" | "deprecated" | "removed";
const MODEL_MUTABLE_FIELDS = ["isEnabled", "displayName"] as const;
type ModelMutableField = (typeof MODEL_MUTABLE_FIELDS)[number];
type ModelMutableUpdates = Partial<Pick<ModelTableRow, ModelMutableField>>;

export interface SyncProviderModelInput {
  providerModelId: string;
  canonicalModelId: string;
  displayName: string | null;
  metadata: Record<string, unknown>;
  lifecycleStatus: Exclude<ModelLifecycleStatus, "removed">;
}

export type UpdateModelInput = ModelMutableUpdates;
export type ProviderModelSyncContext = "provider-added" | "startup";
export interface SyncProviderModelsOptions {
  context: ProviderModelSyncContext;
}
export interface UpdateModelsByProviderIdResult {
  matchedCount: number;
  updatedCount: number;
}

export function getModelById(id: string): ModelTableRow | undefined {
  return getAppDatabase().select().from(models).where(eq(models.id, id)).get();
}

export function listEnabledModels(): ModelTableRow[] {
  return getAppDatabase()
    .select()
    .from(models)
    .where(and(eq(models.isEnabled, true), eq(models.lifecycleStatus, "active")))
    .orderBy(asc(models.providerModelId))
    .all();
}

export function listModelsByProviderId(providerId: string): ModelTableRow[] {
  return getAppDatabase()
    .select()
    .from(models)
    .where(eq(models.providerId, providerId))
    .orderBy(asc(models.providerModelId))
    .all();
}

export function updateModel(modelId: string, input: UpdateModelInput): ModelTableRow | undefined {
  const db = getAppDatabase();

  const existing = db.select().from(models).where(eq(models.id, modelId)).get();
  if (!existing) {
    return undefined;
  }

  const updates = pickDefinedModelFields(input, MODEL_MUTABLE_FIELDS);
  if (Object.keys(updates).length === 0) {
    return existing;
  }

  db.update(models)
    .set({
      ...updates,
      updatedAt: Date.now(),
    })
    .where(eq(models.id, modelId))
    .run();

  return db.select().from(models).where(eq(models.id, modelId)).get();
}

export function updateModelsByProviderId(
  providerId: string,
  input: UpdateModelInput,
): UpdateModelsByProviderIdResult {
  const db = getAppDatabase();
  const existingRows = db.select().from(models).where(eq(models.providerId, providerId)).all();
  const updates = pickDefinedModelFields(input, MODEL_MUTABLE_FIELDS);

  if (existingRows.length === 0) {
    return { matchedCount: 0, updatedCount: 0 };
  }

  if (Object.keys(updates).length === 0) {
    return { matchedCount: existingRows.length, updatedCount: 0 };
  }

  const rowIdsToUpdate = existingRows
    .filter((row) => doesModelRowNeedUpdate(row, updates))
    .map((row) => row.id);

  if (rowIdsToUpdate.length === 0) {
    return { matchedCount: existingRows.length, updatedCount: 0 };
  }

  db.update(models)
    .set({
      ...updates,
      updatedAt: Date.now(),
    })
    .where(inArray(models.id, rowIdsToUpdate))
    .run();

  return {
    matchedCount: existingRows.length,
    updatedCount: rowIdsToUpdate.length,
  };
}

export function syncProviderModels(
  providerId: string,
  syncedModels: SyncProviderModelInput[],
  options: SyncProviderModelsOptions,
): { inserted: number; updated: number; markedDeprecated: number } {
  return getAppDatabase().transaction((tx) => {
    const enablementPolicy = getModelEnablementPolicyForSyncContext(options.context);
    const existingRows = tx.select().from(models).where(eq(models.providerId, providerId)).all();
    const existingByProviderModelId = new Map(
      existingRows.map((row) => [row.providerModelId, row] as const),
    );
    const seenProviderModelIds = new Set<string>();

    let inserted = 0;
    let updated = 0;
    let markedDeprecated = 0;

    for (const syncedModel of syncedModels) {
      seenProviderModelIds.add(syncedModel.providerModelId);

      const existing = existingByProviderModelId.get(syncedModel.providerModelId);
      const nextMetadata = normalizeJsonObject(syncedModel.metadata);
      const serializedNextMetadata = JSON.stringify(nextMetadata);

      if (!existing) {
        tx.insert(models)
          .values({
            id: buildModelId(providerId, syncedModel.providerModelId),
            providerId,
            providerModelId: syncedModel.providerModelId,
            canonicalModelId: syncedModel.canonicalModelId,
            displayName: syncedModel.displayName,
            isEnabled: enablementPolicy.insertedModelEnabled,
            metadata: nextMetadata,
            lifecycleStatus: syncedModel.lifecycleStatus,
          })
          .run();
        inserted += 1;
        continue;
      }

      if (
        existing.canonicalModelId === syncedModel.canonicalModelId &&
        (existing.displayName ?? null) === (syncedModel.displayName ?? null) &&
        (enablementPolicy.existingModelsEnabled === "preserve" ||
          existing.isEnabled === enablementPolicy.existingModelsEnabled) &&
        JSON.stringify(normalizeJsonObject(existing.metadata)) === serializedNextMetadata &&
        existing.lifecycleStatus === syncedModel.lifecycleStatus
      ) {
        continue;
      }

      const nextIsEnabled =
        enablementPolicy.existingModelsEnabled === "preserve"
          ? existing.isEnabled
          : enablementPolicy.existingModelsEnabled;

      tx.update(models)
        .set({
          canonicalModelId: syncedModel.canonicalModelId,
          displayName: syncedModel.displayName,
          isEnabled: nextIsEnabled,
          metadata: nextMetadata,
          lifecycleStatus: syncedModel.lifecycleStatus,
          updatedAt: Date.now(),
        })
        .where(eq(models.id, existing.id))
        .run();
      updated += 1;
    }

    for (const existing of existingRows) {
      if (seenProviderModelIds.has(existing.providerModelId)) {
        continue;
      }

      if (existing.lifecycleStatus === "deprecated") {
        continue;
      }

      tx.update(models)
        .set({
          lifecycleStatus: "deprecated",
          updatedAt: Date.now(),
        })
        .where(eq(models.id, existing.id))
        .run();
      markedDeprecated += 1;
    }

    return { inserted, updated, markedDeprecated };
  });
}

function buildModelId(providerId: string, providerModelId: string): string {
  return `${providerId}:${providerModelId}`;
}

function pickDefinedModelFields(
  input: ModelMutableUpdates,
  keys: readonly ModelMutableField[],
): ModelMutableUpdates {
  const updates: ModelMutableUpdates = {};

  for (const key of keys) {
    if (key === "displayName") {
      if (input.displayName !== undefined) {
        updates.displayName = input.displayName;
      }
      continue;
    }

    if (input.isEnabled !== undefined) {
      updates.isEnabled = input.isEnabled;
    }
  }

  return updates;
}

function doesModelRowNeedUpdate(
  row: ModelTableRow,
  updates: Partial<Pick<ModelTableRow, ModelMutableField>>,
): boolean {
  for (const key of MODEL_MUTABLE_FIELDS) {
    if (updates[key] !== undefined && row[key] !== updates[key]) {
      return true;
    }
  }

  return false;
}

function getModelEnablementPolicyForSyncContext(context: ProviderModelSyncContext): {
  insertedModelEnabled: boolean;
  existingModelsEnabled: boolean | "preserve";
} {
  switch (context) {
    case "provider-added":
      return {
        insertedModelEnabled: true,
        existingModelsEnabled: true,
      };
    case "startup":
      return {
        // Future startup sync should preserve user choices for existing rows and
        // keep newly discovered models disabled until explicitly enabled.
        insertedModelEnabled: false,
        existingModelsEnabled: "preserve",
      };
  }
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
