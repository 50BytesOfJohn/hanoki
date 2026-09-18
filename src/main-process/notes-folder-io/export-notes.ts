import type { WebContents } from "electron";

import type { NotesFolderExportResult } from "@shared/markdown/folder-io";
import type { AppServices } from "../services";
import { pickNotesFolder } from "./pick-directory";
import { buildNotesFolderExportPlan, writeNotesFolderExportPlan } from "./serialize";

export async function exportMarkdownNotesFolder({
  services,
  sender,
  workspaceId,
}: {
  services: AppServices;
  sender: WebContents;
  workspaceId: string;
}): Promise<NotesFolderExportResult> {
  requireWorkspace(services, workspaceId);
  const destination = await pickNotesFolder({
    sender,
    title: "Export markdown notes",
    buttonLabel: "Export",
  });

  if (!destination) {
    return { status: "canceled" };
  }

  services.chatTree.flushAllMarkdownContent();
  const plan = buildNotesFolderExportPlan(services.chatTree.getChatTree(workspaceId));
  await writeNotesFolderExportPlan(destination, plan);

  return {
    status: "exported",
    folderPath: destination,
    noteCount: plan.files.length,
    folderCount: plan.directories.length,
    skippedNonMarkdownCount: plan.skippedNonMarkdownCount,
  };
}

function requireWorkspace(services: AppServices, workspaceId: string): void {
  const workspace = services.workspaces.listWorkspaces().find((entry) => entry.id === workspaceId);
  if (!workspace) {
    throw new Error(`Workspace "${workspaceId}" does not exist.`);
  }
}
