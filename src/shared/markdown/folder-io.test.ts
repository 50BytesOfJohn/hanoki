import { describe, expect, it } from "vitest";

import { formatNotesFolderExportSummary, formatNotesFolderImportSummary } from "./folder-io";

describe("formatNotesFolderExportSummary", () => {
  it("reports skipped non-markdown items", () => {
    expect(
      formatNotesFolderExportSummary({
        status: "exported",
        folderPath: "/notes",
        noteCount: 3,
        folderCount: 1,
        skippedNonMarkdownCount: 2,
      }),
    ).toBe("3 notes saved to /notes. 2 non-markdown items skipped.");
  });

  it("omits the skip clause when nothing was skipped", () => {
    expect(
      formatNotesFolderExportSummary({
        status: "exported",
        folderPath: "/notes",
        noteCount: 1,
        folderCount: 0,
        skippedNonMarkdownCount: 0,
      }),
    ).toBe("1 note saved to /notes.");
  });

  it("warns that an empty workspace has nothing to export", () => {
    expect(
      formatNotesFolderExportSummary({
        status: "exported",
        folderPath: "/notes",
        noteCount: 0,
        folderCount: 0,
        skippedNonMarkdownCount: 0,
      }),
    ).toBe("This workspace has no markdown notes to write as a snapshot.");
  });

  it("mentions skipped chats when the snapshot has no notes", () => {
    expect(
      formatNotesFolderExportSummary({
        status: "exported",
        folderPath: "/notes",
        noteCount: 0,
        folderCount: 0,
        skippedNonMarkdownCount: 2,
      }),
    ).toBe(
      "This workspace has no markdown notes to write as a snapshot. 2 non-markdown items skipped.",
    );
  });
});

describe("formatNotesFolderImportSummary", () => {
  it("reports oversized skips and ignored non-markdown and vault dirs", () => {
    expect(
      formatNotesFolderImportSummary({
        status: "imported",
        folderPath: "/notes",
        noteCount: 3,
        folderCount: 1,
        skippedCount: 2,
        skippedOversizedCount: 2,
        ignoredNonMarkdownCount: 4,
        ignoredDirectoryNames: [".git", ".obsidian"],
        warnings: [],
      }),
    ).toBe(
      "3 notes added from /notes. 2 oversized files skipped. 4 non-markdown files ignored. Ignored .git/, .obsidian/.",
    );
  });

  it("omits zero-count skip clauses", () => {
    expect(
      formatNotesFolderImportSummary({
        status: "imported",
        folderPath: "/notes",
        noteCount: 1,
        folderCount: 0,
        skippedCount: 0,
        skippedOversizedCount: 0,
        ignoredNonMarkdownCount: 0,
        ignoredDirectoryNames: [],
        warnings: [],
      }),
    ).toBe("1 note added from /notes.");
  });
});
