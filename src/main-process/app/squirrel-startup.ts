import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Squirrel.Windows starts the app with one of these flags while it installs,
 * updates or removes it. The app must do its shortcut work and quit, instead
 * of opening normally.
 */
export type SquirrelStartupAction =
  | { kind: "create-shortcut" }
  | { kind: "remove-shortcut" }
  | { kind: "quit" };

export function getSquirrelStartupAction(
  platform: NodeJS.Platform,
  argv: readonly string[],
): SquirrelStartupAction | null {
  if (platform !== "win32") return null;
  switch (argv[1]) {
    case "--squirrel-install":
    case "--squirrel-updated":
      return { kind: "create-shortcut" };
    case "--squirrel-uninstall":
      return { kind: "remove-shortcut" };
    case "--squirrel-obsolete":
      return { kind: "quit" };
    default:
      return null;
  }
}

/**
 * Runs Squirrel's shortcut work when Squirrel launched the app. Returns true
 * when it did, and the caller should then quit.
 */
export function handleSquirrelStartup(): boolean {
  const action = getSquirrelStartupAction(process.platform, process.argv);
  if (!action) return false;
  if (action.kind !== "quit") {
    // Update.exe sits one level above the versioned app folder.
    const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
    const flag = action.kind === "create-shortcut" ? "--createShortcut" : "--removeShortcut";
    // Detached, so it finishes after the app quits.
    spawn(updateExe, [`${flag}=${path.basename(process.execPath)}`], { detached: true }).unref();
  }
  return true;
}
