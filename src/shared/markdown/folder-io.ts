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

function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
  const parts = [`${counted(result.noteCount, "note")} added from ${result.folderPath}.`];
  if (result.skippedOversizedCount > 0) {
    parts.push(`${counted(result.skippedOversizedCount, "oversized file")} skipped.`);
  }
  if (result.ignoredNonMarkdownCount > 0) {
    parts.push(`${counted(result.ignoredNonMarkdownCount, "non-markdown file")} ignored.`);
  }
  if (result.ignoredDirectoryNames.length > 0) {
    parts.push(`Ignored ${result.ignoredDirectoryNames.map((name) => `${name}/`).join(", ")}.`);
  }
  return parts.join(" ");
}
