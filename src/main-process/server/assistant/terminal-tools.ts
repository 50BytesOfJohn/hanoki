import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { jsonSchema, tool } from "ai";

/**
 * Real shell access: commands run in the user's login shell, against their real
 * filesystem, with no sandbox. The safety boundary is the approval flow in the
 * chat UI (see `toolApproval` in the chat route), not this module.
 */

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 30_000;
/** Grace period between SIGTERM and SIGKILL when a command is killed. */
const KILL_ESCALATION_MS = 2_000;

export interface TerminalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  timedOut?: boolean;
}

/**
 * Working directory carried between calls within one chat, so `cd` behaves the
 * way it does in a real terminal. Exported shell variables do not persist —
 * each call is its own process.
 * ponytail: in-memory only; entries outlive nothing but the app run. Move to
 * chat settings if users expect cwd to survive a restart.
 */
const chatWorkingDirectories = new Map<string, string>();

function resolveShell(): { command: string; args: (script: string) => string[] } {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: (script) => ["/d", "/s", "/c", script],
    };
  }

  // `-l` sources the login profile so PATH, nvm, asdf and friends match what
  // the user sees in Terminal. A packaged macOS GUI app otherwise inherits a
  // bare PATH from launchd.
  return {
    command: process.env.SHELL ?? "/bin/bash",
    args: (script) => ["-lc", script],
  };
}

function truncate(output: string, stream: "stdout" | "stderr"): string {
  if (output.length <= MAX_OUTPUT_CHARS) {
    return output;
  }
  const removed = output.length - MAX_OUTPUT_CHARS;
  return `${output.slice(0, MAX_OUTPUT_CHARS)}\n\n[${stream} truncated: ${removed} characters removed]`;
}

/** Kills the whole process group so pipelines and background children die too. */
function killProcessTree(pid: number, signal: NodeJS.Signals) {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    // Negative PID targets the group created by `detached: true`.
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

/**
 * Appends a marker that reports the shell's final `$PWD` on stdout, so the next
 * call can resume there. The marker is random per call so command output cannot
 * forge it.
 */
function buildScript(command: string, marker: string): string {
  if (process.platform === "win32") {
    return `${command}\r\n@set __hanoki_status=%ERRORLEVEL%\r\n@echo|set /p="${marker}%CD%"\r\n@exit /b %__hanoki_status%`;
  }
  // A bare `exit` inside the command skips the marker; the caller then keeps
  // the previous cwd, which is the correct fallback.
  return `${command}\n__hanoki_status=$?\nprintf '%s%s' '${marker}' "$PWD"\nexit $__hanoki_status`;
}

function splitMarker(stdout: string, marker: string): { output: string; cwd: string | null } {
  const index = stdout.lastIndexOf(marker);
  if (index === -1) {
    return { output: stdout, cwd: null };
  }
  const cwd = stdout.slice(index + marker.length).trim();
  return { output: stdout.slice(0, index), cwd: cwd || null };
}

export function getDefaultWorkingDirectory(): string {
  return homedir();
}

/** The shell commands will run in, e.g. "zsh" — shown in settings. */
export function getShellDisplayName(): string {
  return path.basename(resolveShell().command);
}

function getChatCwd(chatId: string, configuredCwd: string): string {
  return chatWorkingDirectories.get(chatId) ?? configuredCwd;
}

/** Resolves a possibly-relative path against the chat's current directory. */
function resolvePath(inputPath: string, cwd: string): string {
  const expanded = inputPath.startsWith("~") ? path.join(homedir(), inputPath.slice(1)) : inputPath;
  return path.resolve(cwd, expanded);
}

export async function runTerminalCommand({
  command,
  chatId,
  configuredCwd,
  abortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  command: string;
  chatId: string;
  configuredCwd: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<TerminalCommandResult> {
  const cwd = getChatCwd(chatId, configuredCwd);
  const marker = `__hanoki_pwd_${randomUUID()}__`;
  const shell = resolveShell();

  return new Promise<TerminalCommandResult>((resolve, reject) => {
    const child = spawn(shell.command, shell.args(buildScript(command, marker)), {
      cwd,
      env: process.env,
      // Own process group, so a timeout can take the whole pipeline with it.
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const escalationTimer = { current: null as NodeJS.Timeout | null };
    const kill = () => {
      if (child.pid === undefined) return;
      killProcessTree(child.pid, "SIGTERM");
      escalationTimer.current = setTimeout(() => {
        if (child.pid !== undefined) killProcessTree(child.pid, "SIGKILL");
      }, KILL_ESCALATION_MS);
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);

    const onAbort = () => {
      kill();
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (escalationTimer.current) clearTimeout(escalationTimer.current);
      abortSignal?.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();

      const { output, cwd: nextCwd } = splitMarker(stdout, marker);
      if (nextCwd) {
        chatWorkingDirectories.set(chatId, nextCwd);
      }

      resolve({
        stdout: truncate(output, "stdout"),
        stderr: truncate(
          timedOut
            ? `${stderr}\nCommand timed out after ${timeoutMs / 1000}s and was terminated.`
            : stderr,
          "stderr",
        ),
        exitCode: code ?? (signal ? 128 : 1),
        cwd: nextCwd ?? cwd,
        ...(timedOut ? { timedOut: true } : {}),
      });
    });
  });
}

export function createTerminalTools({
  chatId,
  configuredCwd,
}: {
  chatId: string;
  configuredCwd: string;
}) {
  return {
    terminalRun: tool({
      description: [
        "Run a shell command on the user's computer, in their real login shell with their real environment and PATH.",
        "This is not a sandbox: it can read, change and delete real files, install software, and reach the network.",
        `Commands start in ${configuredCwd} unless a previous command changed directory.`,
        "The working directory persists between calls, so `cd` sticks. Exported variables do not persist — chain them with && in a single command instead.",
        "Prefer terminalReadFile and terminalWriteFile over cat and heredocs when handling file contents, to avoid shell quoting problems.",
        "If a command is not approved, do not retry it.",
      ].join("\n"),
      inputSchema: jsonSchema<{ command: string }>({
        type: "object",
        properties: {
          command: {
            type: "string",
            minLength: 1,
            description: "The shell command to run.",
          },
        },
        required: ["command"],
        additionalProperties: false,
      }),
      execute: ({ command }, { abortSignal }) =>
        runTerminalCommand({ command, chatId, configuredCwd, abortSignal }),
    }),

    terminalReadFile: tool({
      description:
        "Read a text file from the user's computer. Use this instead of `cat` so the contents arrive unmangled by the shell. Relative paths resolve against the current working directory.",
      inputSchema: jsonSchema<{ path: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            minLength: 1,
            description: "Absolute path, or a path relative to the current working directory.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: async ({ path: filePath }) => {
        const absolutePath = resolvePath(filePath, getChatCwd(chatId, configuredCwd));
        const content = await readFile(absolutePath, "utf8");
        return {
          path: absolutePath,
          content: truncate(content, "stdout"),
        };
      },
    }),

    terminalWriteFile: tool({
      description:
        "Write a text file on the user's computer, creating parent directories as needed and overwriting any existing file. Use this instead of shell redirection or heredocs so content is written exactly as given.",
      inputSchema: jsonSchema<{ path: string; content: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            minLength: 1,
            description: "Absolute path, or a path relative to the current working directory.",
          },
          content: {
            type: "string",
            description: "Full contents to write.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      }),
      execute: async ({ path: filePath, content }) => {
        const absolutePath = resolvePath(filePath, getChatCwd(chatId, configuredCwd));
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content, "utf8");
        return { path: absolutePath, bytesWritten: Buffer.byteLength(content, "utf8") };
      },
    }),
  };
}

export const TERMINAL_TOOL_NAMES = [
  "terminalRun",
  "terminalReadFile",
  "terminalWriteFile",
] as const;
