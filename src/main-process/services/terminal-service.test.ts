import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeAppDatabase, getAppDatabase } from "../db/database";
import { createWorkspace } from "../workspaces/repository";
import {
  createTerminalService,
  parseTerminalRunCompletion,
  stripTerminalAnsi,
} from "./terminal-service";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-terminal-service-"));
const isWindows = process.platform === "win32";

beforeAll(() => {
  process.env["HANOKI_USER_DATA_DIR"] = testDataDirectory;
  const db = getAppDatabase();
  db.run(
    sql.raw(`create table workspaces (
      id text primary key, name text not null, color text,
      settings text not null default '{}', data text not null default '{}',
      metadata text not null default '{}', extensions text not null default '{}',
      created_at integer not null, updated_at integer not null)`),
  );
  db.run(
    sql.raw(`create table folders (
      id text primary key, workspace_id text not null, parent_id text,
      name text not null, data text not null default '{}',
      metadata text not null default '{}', extensions text not null default '{}',
      created_at integer not null, updated_at integer not null)`),
  );
  db.run(
    sql.raw(`create table items (
      id text primary key, workspace_id text not null, folder_id text,
      type text not null, title text not null, data text not null default '{}',
      metadata text not null default '{}', extensions text not null default '{}',
      created_at integer not null, updated_at integer not null)`),
  );
});

afterAll(() => {
  closeAppDatabase();
  delete process.env["HANOKI_USER_DATA_DIR"];
  rmSync(testDataDirectory, { recursive: true, force: true });
});

describe("stripTerminalAnsi", () => {
  it("removes escape sequences and normalizes carriage returns", () => {
    expect(stripTerminalAnsi("\x1b[32mhello\x1b[0m\r\nworld\r!")).toBe("hello\nworld\n!");
  });
});

describe("parseTerminalRunCompletion", () => {
  const marker = "__hanoki_done_abc__";

  it("returns output and exit code once the marker lands", () => {
    expect(parseTerminalRunCompletion(`tick 1\ntick 2\n${marker}:3\nprompt`, marker)).toEqual({
      output: "tick 1\ntick 2",
      exitCode: 3,
    });
  });

  it("does not match the echoed input line or a still-running command", () => {
    expect(parseTerminalRunCompletion(`echo hi; echo ${marker}:$?\ntick 1\n`, marker)).toBeNull();
    expect(parseTerminalRunCompletion("tick 1\n", marker)).toBeNull();
  });
});

describe.skipIf(isWindows)("TerminalService AI port", () => {
  it("runs a command in a Hanoki terminal and fetches plain-text output", async () => {
    // Real PTY waits below (ticks, fetches, interrupt) exceed the 5s default.
    createWorkspace({ id: "terminal-service-workspace", name: "Terminals" });
    const service = createTerminalService();
    const terminal = service.create({
      workspaceId: "terminal-service-workspace",
      title: "Shell",
      folderId: null,
    });
    try {
      const initial = await service.getOutput(terminal.id);
      // Some sandboxes cannot allocate a PTY (posix_openpt denied); the shell
      // then reports "Unable to start". Real PTY coverage runs outside those.
      if (initial.status === "exited" && initial.output.includes("Unable to start")) return;
      const result = await service.runCommand(terminal.id, "echo hanoki-terminal-ok", 15_000);
      expect(result.timedOut).toBe(false);
      expect(result.commandExitCode).toBe(0);
      expect(result.output).toContain("hanoki-terminal-ok");
      expect(result.output).not.toContain("\x1b[");

      const fetched = await service.getOutput(terminal.id);
      expect(fetched.status).toBe("running");
      expect(fetched.output).toContain("hanoki-terminal-ok");

      const slow = await service.runCommand(
        terminal.id,
        "for i in 1 2 3 4 5 6; do echo tick$i; sleep 1; done",
        1_000,
      );
      expect(slow.timedOut).toBe(true);
      expect(slow.commandExitCode).toBeNull();
      expect(slow.output).toContain("tick1");
      expect(slow.output).not.toContain("tick6");

      // The command keeps running in the terminal after the timed-out wait:
      // a later fetch shows ticks that had not appeared yet.
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      const later = await service.getOutput(terminal.id);
      expect(later.output).toContain("tick3");

      // Interrupt stops it: output is unchanged after another tick interval.
      await service.interrupt(terminal.id);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const stopped = await service.getOutput(terminal.id);
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      const afterStop = await service.getOutput(terminal.id);
      expect(afterStop.output).toBe(stopped.output);
    } finally {
      await service.disposeItem(terminal.id);
      await service.disposeAll();
    }
  }, 30_000);
});
