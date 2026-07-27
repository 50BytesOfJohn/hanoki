import type {
  GetActiveWorkspaceOptions,
  TabStateItem,
  WorkspaceSettingsPatch,
  WorkspaceUpdateInput,
} from "@shared/ipc";
import "../lib/electron-api";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";

export const workspaceApi = {
  list() {
    return window.electronAPI.listWorkspaces();
  },

  getActive(options?: GetActiveWorkspaceOptions) {
    return window.electronAPI.getActiveWorkspace(options);
  },

  create(name: string) {
    return window.electronAPI.createWorkspace(name);
  },

  setActive(workspaceId: string) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.setActiveWorkspace(parsedWorkspaceId.value);
  },

  update(workspaceId: string, input: WorkspaceUpdateInput) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.updateWorkspace(parsedWorkspaceId.value, input);
  },

  getSettings(workspaceId: string) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.getWorkspaceSettings(parsedWorkspaceId.value);
  },

  updateSettings(workspaceId: string, settingsPatch: WorkspaceSettingsPatch) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.updateWorkspaceSettings(parsedWorkspaceId.value, settingsPatch);
  },

  getTabsUiState(workspaceId: string) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.getWorkspaceTabsUiState(parsedWorkspaceId.value);
  },

  setTabsUiState(workspaceId: string, tabs: TabStateItem[]) {
    const parsedWorkspaceId = parseWorkspaceId(workspaceId);
    if (!parsedWorkspaceId.ok) {
      throw new Error(parsedWorkspaceId.error);
    }

    return window.electronAPI.setWorkspaceTabsUiState(parsedWorkspaceId.value, tabs);
  },
};
