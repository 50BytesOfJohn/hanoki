import type { WebContents } from "electron";

import type { NotesFolderExportResult } from "@shared/markdown/folder-io";
import type { ChatTreeService } from "../services/chat-tree-service";
import type { AppServices } from "../services";
import { pickNotesFolder } from "./pick-directory";
import { buildNotesFolderExportPlan, writeNotesFolderExportPlan } from "./serialize";

export type NotesFolderExportTree = Pick<
  ChatTreeService,
  "flushAllMarkdownContent" | "getChatTree"
>;

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

  return exportMarkdownNotesToDirectory(services.chatTree, workspaceId, destination);
}

export async function exportMarkdownNotesToDirectory(
  chatTree: NotesFolderExportTree,
  workspaceId: string,
  destination: string,
): Promise<Extract<NotesFolderExportResult, { status: "exported" }>> {
  chatTree.flushAllMarkdownContent();
  const plan = buildNotesFolderExportPlan(chatTree.getChatTree(workspaceId));
  const folderPath = await writeNotesFolderExportPlan(destination, plan);

  return {
    status: "exported",
    folderPath,
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
