import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureWorkspaceFilesystem, getWorkspacePaths } from "../workspaces/filesystem";

const NOTES_ROOT_FILE = "notes-root";

export function rememberNotesRoot(workspaceId: string, source: string): void {
  const paths = ensureWorkspaceFilesystem(workspaceId);
  const root = realpathSync(source);
  if (!statSync(root).isDirectory()) {
    throw new Error(`Notes folder "${source}" is not a directory.`);
  }
  writeFileSync(join(paths.workspaceDir, NOTES_ROOT_FILE), `${root}\n`, "utf8");
}

export function currentNotesRoot(workspaceId: string): string {
  const workspaceDir = getWorkspacePaths(workspaceId).workspaceDir;
  try {
    const stored = readFileSync(join(workspaceDir, NOTES_ROOT_FILE), "utf8").trim();
    if (!stored) return workspaceDir;
    const root = realpathSync(stored);
    if (!statSync(root).isDirectory()) return workspaceDir;
    return root;
  } catch {
    return workspaceDir;
  }
}
