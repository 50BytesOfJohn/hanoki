export type NotesFolderExportResult =
  | { status: "canceled" }
  | { status: "exported"; folderPath: string; noteCount: number; folderCount: number };

export type NotesFolderImportResult =
  | { status: "canceled" }
  | {
      status: "imported";
      folderPath: string;
      noteCount: number;
      folderCount: number;
      skippedCount: number;
      warnings: string[];
    };
