import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runTerminalCommand } from "./terminal-tools";

const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("runTerminalCommand", () => {
  async function makeTempDir() {
    // macOS reports /var/... as /private/var/..., which `$PWD` echoes back.
    return realpath(await mkdtemp(path.join(tmpdir(), "hanoki-terminal-")));
  }

  it("returns stdout without leaking the cwd marker", async () => {
    const cwd = await makeTempDir();
    const result = await runTerminalCommand({
      command: "echo hello",
      chatId: `chat-${crypto.randomUUID()}`,
      configuredCwd: cwd,
    });

    expect(result.stdout).toBe("hello\n");
    expect(result.stdout).not.toContain("__hanoki_pwd_");
    expect(result.exitCode).toBe(0);
  });

  it("propagates a non-zero exit code and stderr", async () => {
    const cwd = await makeTempDir();
    const result = await runTerminalCommand({
      command: "echo oops >&2; exit 3",
      chatId: `chat-${crypto.randomUUID()}`,
      configuredCwd: cwd,
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("oops");
  });

  it("carries the working directory to the next call in the same chat", async () => {
    const cwd = await makeTempDir();
    const chatId = `chat-${crypto.randomUUID()}`;

    await runTerminalCommand({ command: "mkdir -p nested", chatId, configuredCwd: cwd });
    const moved = await runTerminalCommand({ command: "cd nested", chatId, configuredCwd: cwd });
    expect(moved.cwd).toBe(path.join(cwd, "nested"));

    const after = await runTerminalCommand({ command: "pwd", chatId, configuredCwd: cwd });
    expect(after.stdout.trim()).toBe(path.join(cwd, "nested"));
  });

  it("keeps working directories isolated between chats", async () => {
    const cwd = await makeTempDir();
    const chatA = `chat-${crypto.randomUUID()}`;
    const chatB = `chat-${crypto.randomUUID()}`;

    await runTerminalCommand({
      command: "mkdir -p only-a && cd only-a",
      chatId: chatA,
      configuredCwd: cwd,
    });
    const fromB = await runTerminalCommand({ command: "pwd", chatId: chatB, configuredCwd: cwd });

    expect(fromB.stdout.trim()).toBe(cwd);
  });

  it("kills a command that exceeds its timeout", async () => {
    const cwd = await makeTempDir();
    const result = await runTerminalCommand({
      command: "sleep 30",
      chatId: `chat-${crypto.randomUUID()}`,
      configuredCwd: cwd,
      timeoutMs: 500,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("timed out");
  });
});
