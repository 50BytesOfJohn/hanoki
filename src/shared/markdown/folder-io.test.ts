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

function imported(
  overrides: Partial<Extract<Parameters<typeof formatNotesFolderImportSummary>[0], object>>,
) {
  return {
    status: "imported" as const,
    folderPath: "/notes",
    wrapFolderPath: "Imported/Vault",
    noteCount: 1,
    folderCount: 1,
    skippedCount: 0,
    skippedDuplicatePathCount: 0,
    skippedPaths: [],
    failedCount: 0,
    failures: [],
    canceled: false,
    skippedOversizedCount: 0,
    ignoredNonMarkdownCount: 0,
    ignoredDirectoryNames: [],
    warnings: [],
    ...overrides,
  };
}

describe("formatNotesFolderImportSummary", () => {
  it("reports oversized skips and ignored non-markdown and vault dirs", () => {
    expect(
      formatNotesFolderImportSummary(
        imported({
          noteCount: 3,
          skippedCount: 2,
          skippedOversizedCount: 2,
          ignoredNonMarkdownCount: 4,
          ignoredDirectoryNames: [".git", ".obsidian"],
        }),
      ),
    ).toBe(
      "New 3 · Skip 2 · Fail 0. Copied under Imported/Vault. 4 non-markdown files ignored. Ignored .git/, .obsidian/.",
    );
  });

  it("omits zero-count skip clauses", () => {
    expect(formatNotesFolderImportSummary(imported({}))).toBe(
      "New 1 · Skip 0 · Fail 0. Copied under Imported/Vault.",
    );
  });

  it("appends warning paths", () => {
    expect(
      formatNotesFolderImportSummary(
        imported({
          skippedCount: 1,
          skippedOversizedCount: 1,
          warnings: ["huge.md is larger than 5 MiB and was skipped."],
        }),
      ),
    ).toBe(
      "New 1 · Skip 1 · Fail 0. Copied under Imported/Vault. huge.md is larger than 5 MiB and was skipped.",
    );
  });

  it("says when cancel kept a partial copy", () => {
    expect(formatNotesFolderImportSummary(imported({ noteCount: 2, canceled: true }))).toBe(
      "Import canceled. Partial copy kept. New 2 · Skip 0 · Fail 0. Copied under Imported/Vault.",
    );
  });
});
