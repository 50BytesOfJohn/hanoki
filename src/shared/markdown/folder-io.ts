export const NOTES_FOLDER_IMPORT_PROGRESS_MIN = 25;

export const NOTES_FOLDER_REIMPORT_NOTE =
  "Importing this folder again creates a second copy under a new Imported/… root.";

export type NotesFolderExportResult =
  | { status: "canceled" }
  | {
      status: "exported";
      folderPath: string;
      noteCount: number;
      folderCount: number;
      skippedNonMarkdownCount: number;
    };

export interface NotesFolderImportFailure {
  relativePath: string;
  reason: string;
}

export interface NotesFolderImportProgress {
  folderPath: string;
  index: number;
  total: number;
  relativePath: string;
  step?: "linking";
}

export type NotesFolderImportResult =
  | { status: "canceled" }
  | {
      status: "imported";
      folderPath: string;
      /** `Imported/<vaultName>`, relative to the workspace root. */
      wrapFolderPath: string;
      noteCount: number;
      folderCount: number;
      skippedCount: number;
      skippedDuplicatePathCount: number;
      skippedPaths: string[];
      failedCount: number;
      failures: NotesFolderImportFailure[];
      canceled: boolean;
      skippedOversizedCount: number;
      ignoredNonMarkdownCount: number;
      ignoredDirectoryNames: string[];
      warnings: string[];
    };

function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function notesFolderImportSkipCount(
  result: Extract<NotesFolderImportResult, { status: "imported" }>,
): number {
  return result.skippedDuplicatePathCount + result.skippedOversizedCount;
}

export function formatNotesFolderExportSummary(
  result: Extract<NotesFolderExportResult, { status: "exported" }>,
): string {
  const parts = [
    result.noteCount === 0
      ? "This workspace has no markdown notes to write as a snapshot."
      : `${counted(result.noteCount, "note")} saved to ${result.folderPath}.`,
  ];
  if (result.skippedNonMarkdownCount > 0) {
    parts.push(`${counted(result.skippedNonMarkdownCount, "non-markdown item")} skipped.`);
  }
  return parts.join(" ");
}

export function formatNotesFolderImportSummary(
  result: Extract<NotesFolderImportResult, { status: "imported" }>,
): string {
  const skip = notesFolderImportSkipCount(result);
  const counts = `New ${result.noteCount} · Skip ${skip} · Fail ${result.failedCount}.`;
  const placed = `Copied under ${result.wrapFolderPath}. ${NOTES_FOLDER_REIMPORT_NOTE}`;
  const parts = [
    result.canceled
      ? result.noteCount > 0
        ? `Import canceled. Partial copy kept. ${counts} ${placed}`
        : "Import canceled. Nothing was copied."
      : result.noteCount === 0
        ? "No notes imported."
        : `${counts} ${placed}`,
  ];
  if (result.ignoredNonMarkdownCount > 0) {
    parts.push(`${counted(result.ignoredNonMarkdownCount, "non-markdown file")} ignored.`);
  }
  if (result.ignoredDirectoryNames.length > 0) {
    parts.push(`Ignored ${result.ignoredDirectoryNames.map((name) => `${name}/`).join(", ")}.`);
  }
  if (result.warnings.length > 0) {
    parts.push(result.warnings.join(" "));
  }
  return parts.join(" ");
}
