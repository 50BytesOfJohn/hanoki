import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { currentNotesRoot, rememberNotesRoot } from "./notes-root";

const WORKSPACE_ID = "018f6b2e-8c1a-7c3e-8f2a-9b0c1d2e3f4a";
const tempDirs: string[] = [];

afterEach(() => {
  delete process.env["HANOKI_USER_DATA_DIR"];
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("notes root", () => {
  it("remembers the imported notes folder for the workspace", () => {
    const userData = mkdtempSync(join(tmpdir(), "hanoki-notes-root-"));
    const vault = mkdtempSync(join(tmpdir(), "hanoki-vault-"));
    tempDirs.push(userData, vault);
    process.env["HANOKI_USER_DATA_DIR"] = userData;

    expect(currentNotesRoot(WORKSPACE_ID)).toContain(userData);
    rememberNotesRoot(WORKSPACE_ID, vault);
    expect(currentNotesRoot(WORKSPACE_ID)).toBe(vault);
  });
});
