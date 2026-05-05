import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { parseWorkspaceId } from "@shared/workspace/workspace-id";
import { getUserDataDirectory } from "../system/paths";

const WORKSPACES_DIRECTORY_NAME = "workspaces";
const WORKSPACE_ASSETS_DIRECTORY_NAME = "assets";

export interface WorkspacePaths {
  workspaceId: string;
  rootDir: string;
  workspaceDir: string;
  assetsDir: string;
}

function assertWorkspaceId(workspaceId: string): void {
  const parsed = parseWorkspaceId(workspaceId);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
}

export function getWorkspacesRootDirectory(): string {
  return join(getUserDataDirectory(), WORKSPACES_DIRECTORY_NAME);
}

export function ensureWorkspaceRootDirectory(): string {
  const rootDir = getWorkspacesRootDirectory();
  mkdirSync(rootDir, { recursive: true });
  return rootDir;
}

export function getWorkspacePaths(workspaceId: string): WorkspacePaths {
  assertWorkspaceId(workspaceId);

  const rootDir = getWorkspacesRootDirectory();
  const workspaceDir = join(rootDir, workspaceId);

  return {
    workspaceId,
    rootDir,
    workspaceDir,
    assetsDir: join(workspaceDir, WORKSPACE_ASSETS_DIRECTORY_NAME),
  };
}

export function ensureWorkspaceFilesystem(workspaceId: string): WorkspacePaths {
  const workspacePaths = getWorkspacePaths(workspaceId);
  mkdirSync(workspacePaths.workspaceDir, { recursive: true });
  mkdirSync(workspacePaths.assetsDir, { recursive: true });
  return workspacePaths;
}
