import { describe, expect, it } from "vitest";

import { getSquirrelStartupAction } from "./squirrel-startup";

const exe = "C:\\Hanoki\\app-1.0.0\\Hanoki.exe";

describe("getSquirrelStartupAction", () => {
  it.each([
    ["--squirrel-install", "create-shortcut"],
    ["--squirrel-updated", "create-shortcut"],
    ["--squirrel-uninstall", "remove-shortcut"],
    ["--squirrel-obsolete", "quit"],
  ])("maps %s on Windows to %s", (flag, kind) => {
    expect(getSquirrelStartupAction("win32", [exe, flag])).toEqual({ kind });
  });

  it("starts normally without a Squirrel flag", () => {
    expect(getSquirrelStartupAction("win32", [exe])).toBeNull();
    expect(getSquirrelStartupAction("win32", [exe, "--squirrel-firstrun"])).toBeNull();
  });

  it("ignores Squirrel flags off Windows", () => {
    expect(getSquirrelStartupAction("darwin", ["Hanoki", "--squirrel-install"])).toBeNull();
    expect(getSquirrelStartupAction("linux", ["hanoki", "--squirrel-install"])).toBeNull();
  });
});
