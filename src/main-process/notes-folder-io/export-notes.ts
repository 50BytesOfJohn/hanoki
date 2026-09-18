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
  services.chatTree.flushAllMarkdownContent();
  const snapshot = services.chatTree.getChatTree(workspaceId);
  const destination = await pickNotesFolder({
    sender,
    title: "Export markdown notes",
    buttonLabel: "Export",
  });

  if (!destination) {
    return { status: "canceled" };
  }

  const plan = buildNotesFolderExportPlan(snapshot);
  await writeNotesFolderExportPlan(destination, plan);

  return {
    status: "exported",
    folderPath: destination,
    noteCount: plan.files.length,
    folderCount: plan.directories.length,
  };
}
