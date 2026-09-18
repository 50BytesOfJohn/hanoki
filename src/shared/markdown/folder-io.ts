export type NotesFolderExportResult =
  | { status: "canceled" }
  | {
      status: "exported";
      folderPath: string;
      noteCount: number;
      folderCount: number;
      skippedNonMarkdownCount: number;
    };

export type NotesFolderImportResult =
  | { status: "canceled" }
  | {
      status: "imported";
      folderPath: string;
      noteCount: number;
      folderCount: number;
      skippedCount: number;
      skippedOversizedCount: number;
      ignoredNonMarkdownCount: number;
      ignoredDirectoryNames: string[];
      warnings: string[];
    };

export function formatNotesFolderExportSummary(
  result: Extract<NotesFolderExportResult, { status: "exported" }>,
): string {
  const parts = [`${result.noteCount} notes saved to ${result.folderPath}.`];
  if (result.skippedNonMarkdownCount > 0) {
    const noun = result.skippedNonMarkdownCount === 1 ? "item" : "items";
    parts.push(`${result.skippedNonMarkdownCount} non-markdown ${noun} skipped.`);
  }
  return parts.join(" ");
}

export function formatNotesFolderImportSummary(
  result: Extract<NotesFolderImportResult, { status: "imported" }>,
): string {
  const parts = [`${result.noteCount} notes added from ${result.folderPath}.`];
  if (result.skippedOversizedCount > 0) {
    const noun = result.skippedOversizedCount === 1 ? "file" : "files";
    parts.push(`${result.skippedOversizedCount} oversized ${noun} skipped.`);
  }
  if (result.ignoredNonMarkdownCount > 0) {
    const noun = result.ignoredNonMarkdownCount === 1 ? "file" : "files";
    parts.push(`${result.ignoredNonMarkdownCount} non-markdown ${noun} ignored.`);
  }
  if (result.ignoredDirectoryNames.length > 0) {
    parts.push(`Ignored ${result.ignoredDirectoryNames.map((name) => `${name}/`).join(", ")}.`);
  }
  return parts.join(" ");
}
