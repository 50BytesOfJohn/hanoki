import { asc, eq } from "drizzle-orm";

import { DEFAULT_WORKSPACE_ID } from "@shared/workspace/workspace-id";
import type { WorkspaceSettings, WorkspaceSettingsPatch } from "@shared/ipc";
import { getAppDatabase } from "../db/database";
import { workspaces } from "../db/schema";

export interface WorkspaceRow {
  id: string;
  name: string;
  color: string | null;
  settings: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceInfoRow {
  id: string;
  name: string;
  color: string | null;
}

interface CreateWorkspaceInput {
  id: string;
  name: string;
  color?: string | null;
  settings?: WorkspaceSettings;
}

interface UpdateWorkspaceInput {
  name?: string;
  color?: string | null;
}

type WorkspaceTableRow = typeof workspaces.$inferSelect;
type WorkspaceInfoTableRow = Pick<WorkspaceTableRow, "id" | "name" | "color">;

function isWorkspaceSettings(value: unknown): value is WorkspaceSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set<keyof WorkspaceSettings>([
    "chatTreeExpandedFolderIds",
    "tabs",
    "activeTabId",
  ]);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key as keyof WorkspaceSettings)) {
      return false;
    }
  }

  if (
    record.chatTreeExpandedFolderIds !== undefined &&
    (!Array.isArray(record.chatTreeExpandedFolderIds) ||
      record.chatTreeExpandedFolderIds.some((entry) => typeof entry !== "string"))
  ) {
    return false;
  }

  if (
    record.tabs !== undefined &&
    (!Array.isArray(record.tabs) ||
      record.tabs.some((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return true;
        }

        const tabRecord = entry as Record<string, unknown>;
        const hasOnlySupportedKeys = Object.keys(tabRecord).every((key) =>
          ["id", "type", "chatId"].includes(key),
        );
        if (!hasOnlySupportedKeys) {
          return true;
        }

        return (
          typeof tabRecord.id !== "string" ||
          tabRecord.id.trim().length === 0 ||
          tabRecord.type !== "chat" ||
          typeof tabRecord.chatId !== "string" ||
          tabRecord.chatId.trim().length === 0
        );
      }))
  ) {
    return false;
  }

  if (
    record.activeTabId !== undefined &&
    record.activeTabId !== null &&
    typeof record.activeTabId !== "string"
  ) {
    return false;
  }

  return true;
}

function normalizeWorkspaceSettings(raw: unknown, workspaceId: string): WorkspaceSettings {
  if (!isWorkspaceSettings(raw)) {
    console.warn(
      `[workspaces] Invalid settings JSON object for workspace "${workspaceId}", using empty object.`,
    );
    return {};
  }

  return raw;
}

function toWorkspaceRow(row: WorkspaceTableRow): WorkspaceRow {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    settings: normalizeWorkspaceSettings(row.settings, row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWorkspaceInfoRow(row: WorkspaceInfoTableRow): WorkspaceInfoRow {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
  };
}

function requireWorkspaceById(id: string): WorkspaceRow {
  const workspace = getWorkspaceById(id);
  if (!workspace) {
    throw new Error(`Workspace "${id}" does not exist.`);
  }
  return workspace;
}

function requireWorkspaceInfoById(id: string): WorkspaceInfoRow {
  const workspace = getWorkspaceInfoById(id);
  if (!workspace) {
    throw new Error(`Workspace "${id}" does not exist.`);
  }
  return workspace;
}

export function getDefaultWorkspaceName(id: string): string {
  if (id === DEFAULT_WORKSPACE_ID) {
    return "Default";
  }

  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function listWorkspaces(): WorkspaceRow[] {
  const rows = getAppDatabase().select().from(workspaces).orderBy(asc(workspaces.id)).all();
  return rows.map(toWorkspaceRow);
}

export function listWorkspaceInfoRows(): WorkspaceInfoRow[] {
  const rows = getAppDatabase()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      color: workspaces.color,
    })
    .from(workspaces)
    .orderBy(asc(workspaces.id))
    .all();

  return rows.map(toWorkspaceInfoRow);
}

export function getWorkspaceById(id: string): WorkspaceRow | null {
  const row = getAppDatabase().select().from(workspaces).where(eq(workspaces.id, id)).get();
  return row ? toWorkspaceRow(row) : null;
}

export function getWorkspaceInfoById(id: string): WorkspaceInfoRow | null {
  const row = getAppDatabase()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      color: workspaces.color,
    })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();

  return row ? toWorkspaceInfoRow(row) : null;
}

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
  const settings = input.settings ?? {};

  getAppDatabase()
    .insert(workspaces)
    .values({
      id: input.id,
      name: input.name,
      color: input.color ?? null,
      settings,
    })
    .run();

  return requireWorkspaceById(input.id);
}

export function deleteWorkspace(id: string): void {
  getAppDatabase().delete(workspaces).where(eq(workspaces.id, id)).run();
}

export function updateWorkspace(id: string, patch: UpdateWorkspaceInput): WorkspaceInfoRow {
  const nextValues: Partial<typeof workspaces.$inferInsert> = {};

  if (patch.name !== undefined) {
    nextValues.name = patch.name;
  }

  if (patch.color !== undefined) {
    nextValues.color = patch.color;
  }

  if (Object.keys(nextValues).length === 0) {
    return requireWorkspaceInfoById(id);
  }

  nextValues.updatedAt = Date.now();

  getAppDatabase().update(workspaces).set(nextValues).where(eq(workspaces.id, id)).run();

  return requireWorkspaceInfoById(id);
}

export function getWorkspaceSettings(id: string): WorkspaceSettings {
  return requireWorkspaceById(id).settings;
}

export function updateWorkspaceSettings(id: string, patch: WorkspaceSettingsPatch): WorkspaceRow {
  if (!isWorkspaceSettings(patch)) {
    throw new Error("Workspace settings patch must be a JSON object.");
  }

  const currentSettings = getWorkspaceSettings(id);
  const nextSettings: WorkspaceSettings = {
    ...currentSettings,
    ...patch,
  };

  getAppDatabase()
    .update(workspaces)
    .set({
      settings: nextSettings,
      updatedAt: Date.now(),
    })
    .where(eq(workspaces.id, id))
    .run();

  return requireWorkspaceById(id);
}

export function ensureDefaultWorkspace(): WorkspaceRow {
  const existingWorkspace = listWorkspaces()[0];
  if (existingWorkspace) {
    return existingWorkspace;
  }

  return createWorkspace({
    id: DEFAULT_WORKSPACE_ID,
    name: getDefaultWorkspaceName(DEFAULT_WORKSPACE_ID),
    settings: {},
  });
}
