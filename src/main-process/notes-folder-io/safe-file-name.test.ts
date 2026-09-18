import { describe, expect, it } from "vitest";

import { safeFileName, uniqueName } from "./safe-file-name";

describe("safeFileName", () => {
  it("replaces reserved characters and trims trailing dots", () => {
    expect(safeFileName("Act 1/Scene:Take?", "Note")).toBe("Act 1-Scene-Take");
    expect(safeFileName("Ending...", "Note")).toBe("Ending");
    expect(safeFileName("   ", "Note")).toBe("Note");
  });

  it("falls back when the title is empty after sanitizing", () => {
    expect(safeFileName("///", "Folder")).toBe("Folder");
    expect(safeFileName("", "Note")).toBe("Note");
  });
});

describe("uniqueName", () => {
  it("disambiguates collisions with -2, -3, …", () => {
    const used = new Set<string>();
    expect(uniqueName("title", used, ".md")).toBe("title.md");
    expect(uniqueName("title", used, ".md")).toBe("title-2.md");
    expect(uniqueName("title", used, ".md")).toBe("title-3.md");
  });

  it("treats names as case-insensitive so Note.md and note.md collide", () => {
    const used = new Set<string>();
    expect(uniqueName("Note", used, ".md")).toBe("Note.md");
    expect(uniqueName("note", used, ".md")).toBe("note-2.md");
  });

  it("lets a folder and a .md file share a stem", () => {
    const used = new Set<string>();
    expect(uniqueName("Notes", used)).toBe("Notes");
    expect(uniqueName("Notes", used, ".md")).toBe("Notes.md");
  });
});
