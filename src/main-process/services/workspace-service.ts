import { getConfig, updateConfig } from "../config";
import { createUuidV7 } from "../db/uuidv7";
import { ensureWorkspaceFilesystem } from "../workspaces/filesystem";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceInfoById as getWorkspaceInfoRowById,
  getWorkspaceSettings,
  listWorkspaceInfoRows,
  updateWorkspaceSettings as updateWorkspaceSettingsRecord,
  updateWorkspace as updateWorkspaceRecord,
  type WorkspaceRow,
} from "../workspaces/repository";
import type {
  ActiveWorkspaceInfo,
  GetActiveWorkspaceOptions,
  WorkspaceInfo,
  WorkspaceSettings,
  WorkspaceSettingsPatch,
  WorkspaceUpdateInput,
} from "@shared/ipc";

export interface WorkspaceService {
  listWorkspaces(): WorkspaceInfo[];
  getActiveWorkspace(options?: GetActiveWorkspaceOptions): ActiveWorkspaceInfo;
  createWorkspace(name: string): WorkspaceInfo;
  setActiveWorkspace(id: string): ActiveWorkspaceInfo;
  updateWorkspace(id: string, input: WorkspaceUpdateInput): WorkspaceInfo;
  updateWorkspaceSettings(id: string, settingsPatch: WorkspaceSettingsPatch): WorkspaceSettings;
}

function toWorkspaceInfo(workspace: Pick<WorkspaceRow, "id" | "name" | "color">): WorkspaceInfo {
  return {
    id: workspace.id,
    name: workspace.name,
    color: workspace.color ?? undefined,
  };
}

function createWorkspaceId(existingIds: readonly string[]): string {
  const existingIdsSet = new Set(existingIds);
  for (;;) {
    const candidateId = createUuidV7();
    if (!existingIdsSet.has(candidateId)) {
      return candidateId;
    }
  }
}

function getWorkspaceInfoById(id: string): WorkspaceInfo {
  const workspace = getWorkspaceInfoRowById(id);
  if (!workspace) {
    throw new Error(`Workspace "${id}" does not exist.`);
  }
  return toWorkspaceInfo(workspace);
}

export function createWorkspaceService(): WorkspaceService {
  return {
    listWorkspaces(): WorkspaceInfo[] {
      return listWorkspaceInfoRows().map(toWorkspaceInfo);
    },

    getActiveWorkspace(options): ActiveWorkspaceInfo {
      const includeSettings = options?.includeSettings ?? false;
      const workspaceInfos = listWorkspaceInfoRows().map(toWorkspaceInfo);
      const configuredActiveWorkspaceId = getConfig().app.activeWorkspaceId;

      const activeWorkspace = workspaceInfos.find(
        (workspaceInfo) => workspaceInfo.id === configuredActiveWorkspaceId,
      );
      if (activeWorkspace) {
        if (!includeSettings) {
          return activeWorkspace;
        }

        return {
          ...activeWorkspace,
          settings: getWorkspaceSettings(activeWorkspace.id),
        };
      }

      const fallbackWorkspace = workspaceInfos[0];
      if (!fallbackWorkspace) {
        throw new Error("No workspaces available.");
      }

      updateConfig({ app: { activeWorkspaceId: fallbackWorkspace.id } });
      if (!includeSettings) {
        return fallbackWorkspace;
      }

      return {
        ...fallbackWorkspace,
        settings: getWorkspaceSettings(fallbackWorkspace.id),
      };
    },

    createWorkspace(name: string): WorkspaceInfo {
      const workspaceId = createWorkspaceId(
        listWorkspaceInfoRows().map((workspace) => workspace.id),
      );

      const createdWorkspace = createWorkspace({
        id: workspaceId,
        name,
        color: null,
        settings: {},
      });

      try {
        ensureWorkspaceFilesystem(workspaceId);
      } catch (error) {
        try {
          deleteWorkspace(workspaceId);
        } catch (rollbackError) {
          console.error(
            `[workspaces] Failed to roll back workspace "${workspaceId}" after filesystem error.`,
            rollbackError,
          );
        }
        throw error;
      }

      updateConfig({ app: { activeWorkspaceId: workspaceId } });
      return toWorkspaceInfo(createdWorkspace);
    },

    setActiveWorkspace(id: string): ActiveWorkspaceInfo {
      if (!getWorkspaceInfoRowById(id)) {
        throw new Error(`Workspace "${id}" does not exist.`);
      }

      updateConfig({ app: { activeWorkspaceId: id } });
      return {
        ...getWorkspaceInfoById(id),
        settings: getWorkspaceSettings(id),
      };
    },

    updateWorkspace(id: string, input: WorkspaceUpdateInput): WorkspaceInfo {
      const existingWorkspace = getWorkspaceInfoRowById(id);
      if (!existingWorkspace) {
        throw new Error(`Workspace "${id}" does not exist.`);
      }

      if (input.name === undefined && input.color === undefined) {
        return toWorkspaceInfo(existingWorkspace);
      }

      return toWorkspaceInfo(
        updateWorkspaceRecord(id, {
          name: input.name,
          color: input.color,
        }),
      );
    },

    updateWorkspaceSettings(id: string, settingsPatch: WorkspaceSettingsPatch): WorkspaceSettings {
      const updatedWorkspace = updateWorkspaceSettingsRecord(id, settingsPatch);
      return updatedWorkspace.settings;
    },
  };
}
