import { describe, expect, it } from "vitest";

import { formatNotesFolderImportSummary } from "./folder-io";

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
    ).toBe("1 notes added from /notes.");
  });
});
