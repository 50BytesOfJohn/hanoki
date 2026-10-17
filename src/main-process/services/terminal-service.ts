import { randomUUID } from "node:crypto";

import type { WebContents } from "electron";
import * as pty from "node-pty";

import {
  TERMINAL_SCROLLBACK_VERSION,
  TERMINAL_EVENT_CHANNEL,
  type TerminalEvent,
  type TerminalInfo,
  type TerminalSessionSnapshot,
} from "@shared/ipc";
import {
  createTerminal as createTerminalInRepo,
  getItemById,
  updateTerminalData,
  type TerminalRow,
} from "../chat-tree/repository";
import { readTerminalToolSettings } from "./settings-service";
import { TerminalState } from "./terminal-state";

const PERSIST_DELAY_MS = 1_000;
const SESSION_SEPARATOR = "\r\n\x1b[90m— new Hanoki session —\x1b[0m\r\n";

interface TerminalSession {
  itemId: string;
  process: pty.IPty | null;
  terminalState: TerminalState;
  pendingData: string;
  sequence: number;
  status: "running" | "exited";
  exitCode: number | null;
  subscribers: Map<number, WebContents>;
  persistTimer: NodeJS.Timeout | null;
  persistChain: Promise<void>;
  closing: boolean;
  dataDisposable: pty.IDisposable | null;
  exitDisposable: pty.IDisposable | null;
}

export interface TerminalOutputSnapshot {
  itemId: string;
  status: "running" | "exited" | "not-started";
  exitCode: number | null;
  /** Plain-text scrollback (ANSI stripped), most recent output last. */
  output: string;
  truncated: boolean;
}

export interface TerminalRunResult extends TerminalOutputSnapshot {
  command: string;
  /** True only when the wait elapsed and the command may still be running. */
  timedOut: boolean;
  /** Exit code of the command itself when it finished; null while running or unknown. */
  commandExitCode: number | null;
}

/**
 * Finds the completion marker runCommand appends after the command. Returns
 * the output before the marker and the command's exit code, or null while the
 * command has not finished. The echoed input line contains the marker text
 * followed by `:$?`, never digits, so it cannot produce a false match.
 */
export function parseTerminalRunCompletion(
  delta: string,
  marker: string,
): { output: string; exitCode: number } | null {
  const prefix = `${marker}:`;
  const index = delta.lastIndexOf(prefix);
  if (index === -1) return null;
  const match = /^(\d+)/.exec(delta.slice(index + prefix.length));
  if (!match) return null;
  return {
    output: delta.slice(0, index).replace(/\n$/, ""),
    exitCode: Number(match[1]),
  };
}

function extractOutputDelta(before: string, after: string): string {
  if (after.startsWith(before)) return after.slice(before.length);
  return after.length > before.length ? after.slice(before.length) : after;
}

export interface TerminalService {
  create(input: { workspaceId: string; title: string; folderId: string | null }): TerminalInfo;
  start(id: string, sender: WebContents): Promise<TerminalSessionSnapshot>;
  write(id: string, data: string): void;
  resize(id: string, columns: number, rows: number): void;
  disposeItem(id: string): Promise<void>;
  pruneMissingItems(): Promise<void>;
  disposeAll(): Promise<void>;
  /** Starts the PTY if needed (no renderer subscriber) and returns plain-text output. */
  ensureSession(id: string): Promise<TerminalOutputSnapshot>;
  getOutput(id: string, maxChars?: number): Promise<TerminalOutputSnapshot>;
  runCommand(id: string, command: string, timeoutMs?: number): Promise<TerminalRunResult>;
  writeInput(id: string, data: string): Promise<TerminalOutputSnapshot>;
  interrupt(id: string): Promise<TerminalOutputSnapshot>;
}

const MAX_AI_OUTPUT_CHARS = 30_000;
const DEFAULT_RUN_TIMEOUT_MS = 30_000;
const MAX_RUN_TIMEOUT_MS = 120_000;

/** Strips ANSI/VT sequences so AI tools get readable plain text. */
export function stripTerminalAnsi(text: string): string {
  const esc = "\x1b";
  const bel = "\x07";
  const withoutSequences = text
    .replace(new RegExp(`${esc}\\][^${bel}${esc}]*(?:${bel}|${esc}\\\\)`, "g"), "")
    .replace(new RegExp(`${esc}\\[[0-9;?]*[ -/]*[@-~]`, "g"), "")
    .replace(new RegExp(`${esc}[()][0-9A-B]`, "g"), "")
    .replace(new RegExp(`${esc}.`, "g"), "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return [...withoutSequences]
    .filter((char) => char === "\n" || char === "\t" || char.charCodeAt(0) >= 32)
    .join("");
}

function capOutput(text: string): { output: string; truncated: boolean } {
  if (text.length <= MAX_AI_OUTPUT_CHARS) return { output: text, truncated: false };
  return { output: text.slice(-MAX_AI_OUTPUT_CHARS), truncated: true };
}

function toTerminalInfo(terminal: TerminalRow): TerminalInfo {
  return { ...terminal };
}

function resolveShell(): string {
  return process.platform === "win32"
    ? (process.env.ComSpec ?? "cmd.exe")
    : (process.env.SHELL ?? "/bin/bash");
}

function shellEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[key] = value;
  }
  environment.TERM = "xterm-256color";
  environment.COLORTERM = "truecolor";
  return environment;
}

async function snapshot(session: TerminalSession): Promise<TerminalSessionSnapshot> {
  await session.terminalState.whenIdle();
  return {
    itemId: session.itemId,
    sequence: session.sequence,
    scrollback: session.terminalState.serializeForLiveSession(),
    status: session.status,
    exitCode: session.exitCode,
  };
}

export function createTerminalService(): TerminalService {
  const sessions = new Map<string, TerminalSession>();

  function emit(session: TerminalSession, event: TerminalEvent): void {
    for (const [id, subscriber] of session.subscribers) {
      if (subscriber.isDestroyed()) {
        session.subscribers.delete(id);
      } else {
        subscriber.send(TERMINAL_EVENT_CHANNEL, event);
      }
    }
  }

  function append(session: TerminalSession, data: string): void {
    if (!data) return;
    session.terminalState.write(data, () => schedulePersist(session));
    session.pendingData += data;
  }

  function persist(session: TerminalSession): Promise<void> {
    if (session.persistTimer) clearTimeout(session.persistTimer);
    session.persistTimer = null;
    const operation = session.persistChain.then(async () => {
      await session.terminalState.whenIdle();
      const item = getItemById(session.itemId);
      if (!item || item.type !== "terminal") return;
      updateTerminalData(
        session.itemId,
        {
          scrollback: session.terminalState.serializeForRestart(),
          scrollbackVersion: TERMINAL_SCROLLBACK_VERSION,
        },
        { touchUpdatedAt: false },
      );
    });
    session.persistChain = operation.catch((error) => {
      console.error(`[terminal] Failed to persist terminal "${session.itemId}".`, error);
    });
    return operation;
  }

  function schedulePersist(session: TerminalSession): void {
    if (session.closing) return;
    if (session.persistTimer) clearTimeout(session.persistTimer);
    session.persistTimer = setTimeout(() => {
      void persist(session).catch(() => undefined);
    }, PERSIST_DELAY_MS);
  }

  function flushData(session: TerminalSession): void {
    if (!session.pendingData) return;
    const data = session.pendingData;
    session.pendingData = "";
    session.sequence += 1;
    emit(session, { type: "data", itemId: session.itemId, sequence: session.sequence, data });
  }

  function subscribe(session: TerminalSession, sender: WebContents): void {
    session.subscribers.set(sender.id, sender);
  }

  function spawn(session: TerminalSession, terminal: TerminalRow): void {
    const shell = terminal.data.shell || resolveShell();
    const args = process.platform === "win32" ? [] : ["-l"];
    try {
      const processHandle = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: terminal.data.columns,
        rows: terminal.data.rows,
        cwd: terminal.data.workingDirectory,
        env: shellEnvironment(),
      });
      session.process = processHandle;
      session.status = "running";
      session.exitCode = null;
      session.dataDisposable = processHandle.onData((data) => {
        append(session, data);
        flushData(session);
      });
      session.exitDisposable = processHandle.onExit(({ exitCode }) => {
        flushData(session);
        session.process = null;
        session.status = "exited";
        session.exitCode = exitCode;
        session.sequence += 1;
        emit(session, {
          type: "exit",
          itemId: session.itemId,
          sequence: session.sequence,
          exitCode,
        });
        void persist(session).catch(() => undefined);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(session, `\r\n\x1b[31mUnable to start ${shell}: ${message}\x1b[0m\r\n`);
      flushData(session);
      session.status = "exited";
      session.exitCode = null;
      void persist(session).catch(() => undefined);
    }
  }

  function newSession(terminal: TerminalRow): TerminalSession {
    const canRestore = terminal.data.scrollbackVersion === TERMINAL_SCROLLBACK_VERSION;
    const persisted = canRestore ? terminal.data.scrollback : "";
    if (!canRestore) {
      updateTerminalData(
        terminal.id,
        { scrollback: "", scrollbackVersion: TERMINAL_SCROLLBACK_VERSION },
        { touchUpdatedAt: false },
      );
    }
    const terminalState = new TerminalState(terminal.data.columns, terminal.data.rows);
    if (persisted) {
      terminalState.write(persisted);
      terminalState.write(SESSION_SEPARATOR);
    }
    const session: TerminalSession = {
      itemId: terminal.id,
      process: null,
      terminalState,
      pendingData: "",
      sequence: 0,
      status: "running",
      exitCode: null,
      subscribers: new Map<number, WebContents>(),
      persistTimer: null,
      persistChain: Promise.resolve(),
      closing: false,
      dataDisposable: null,
      exitDisposable: null,
    };
    sessions.set(terminal.id, session);
    spawn(session, terminal);
    return session;
  }

  function getTerminal(id: string): TerminalRow {
    const item = getItemById(id);
    if (!item) throw new Error(`Terminal item "${id}" does not exist.`);
    if (item.type !== "terminal") throw new Error(`Item "${id}" is not a terminal.`);
    return item;
  }

  async function disposeSession(session: TerminalSession, shouldPersist: boolean): Promise<void> {
    session.closing = true;
    if (session.persistTimer) clearTimeout(session.persistTimer);
    session.persistTimer = null;
    session.dataDisposable?.dispose();
    session.exitDisposable?.dispose();
    session.dataDisposable = null;
    session.exitDisposable = null;
    try {
      session.process?.kill();
    } catch {
      // The process already exited.
    }
    session.process = null;
    if (shouldPersist) await persist(session);
    session.terminalState.dispose();
  }

  async function discardSession(session: TerminalSession): Promise<void> {
    session.closing = true;
    if (session.persistTimer) clearTimeout(session.persistTimer);
    session.dataDisposable?.dispose();
    session.exitDisposable?.dispose();
    try {
      session.process?.kill();
    } catch {
      // The process already exited.
    }
    await session.terminalState.whenIdle();
    await session.persistChain;
    session.terminalState.dispose();
  }

  return {
    create(input): TerminalInfo {
      const defaults = readTerminalToolSettings();
      return toTerminalInfo(
        createTerminalInRepo({
          ...input,
          data: {
            workingDirectory: defaults.workingDirectory,
            shell: resolveShell(),
            columns: 80,
            rows: 24,
            scrollback: "",
            scrollbackVersion: TERMINAL_SCROLLBACK_VERSION,
          },
        }),
      );
    },

    async start(id, sender): Promise<TerminalSessionSnapshot> {
      const item = getTerminal(id);
      const session = sessions.get(id) ?? newSession(item);
      subscribe(session, sender);
      flushData(session);
      return await snapshot(session);
    },

    async ensureSession(id): Promise<TerminalOutputSnapshot> {
      return this.getOutput(id);
    },

    async getOutput(id, maxChars): Promise<TerminalOutputSnapshot> {
      const item = getTerminal(id);
      const session = sessions.get(id) ?? newSession(item);
      await session.terminalState.whenIdle();
      const plain = stripTerminalAnsi(session.terminalState.serializeForLiveSession());
      const capped =
        maxChars !== undefined && plain.length > maxChars
          ? { output: plain.slice(-maxChars), truncated: true }
          : capOutput(plain);
      return {
        itemId: id,
        status: session.status,
        exitCode: session.exitCode,
        ...capped,
      };
    },

    async runCommand(id, command, timeoutMs): Promise<TerminalRunResult> {
      const trimmed = command.trim();
      if (!trimmed) throw new Error("Terminal command cannot be empty.");
      const item = getTerminal(id);
      const session = sessions.get(id) ?? newSession(item);
      if (!session.process || session.status !== "running") {
        throw new Error(`Terminal "${id}" is not running. Its shell has exited.`);
      }
      await session.terminalState.whenIdle();
      const before = stripTerminalAnsi(session.terminalState.serializeForLiveSession());
      // Completion is detected by a marker echoed after the command, not by
      // output going quiet — periodic output (ticks, progress) stays quiet
      // between lines and previously looked "finished" long before it was.
      const marker = `__hanoki_done_${randomUUID().replaceAll("-", "")}__`;
      session.process.write(`${trimmed}; echo ${marker}:$?\r`);
      const timeout = Math.min(
        MAX_RUN_TIMEOUT_MS,
        Math.max(1_000, timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS),
      );
      const deadline = Date.now() + timeout;
      let timedOut = false;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await session.terminalState.whenIdle();
        const nowText = stripTerminalAnsi(session.terminalState.serializeForLiveSession());
        const completion = parseTerminalRunCompletion(extractOutputDelta(before, nowText), marker);
        if (completion) {
          const capped = capOutput(completion.output.replace(/^\n+/, ""));
          return {
            itemId: id,
            status: session.status,
            exitCode: session.exitCode,
            ...capped,
            command: trimmed,
            timedOut: false,
            commandExitCode: completion.exitCode,
          };
        }
        if (session.status !== "running") break;
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
      }
      const after = stripTerminalAnsi(session.terminalState.serializeForLiveSession());
      const delta = extractOutputDelta(before, after);
      const capped = capOutput(delta.replace(/^\n+/, ""));
      return {
        itemId: id,
        status: session.status,
        exitCode: session.exitCode,
        ...capped,
        command: trimmed,
        timedOut,
        commandExitCode: null,
      };
    },

    async writeInput(id, data): Promise<TerminalOutputSnapshot> {
      const item = getTerminal(id);
      const session = sessions.get(id) ?? newSession(item);
      if (!session.process || session.status !== "running") {
        throw new Error(`Terminal "${id}" is not running. Its shell has exited.`);
      }
      session.process.write(data);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return this.getOutput(id);
    },

    async interrupt(id): Promise<TerminalOutputSnapshot> {
      return this.writeInput(id, "\x03");
    },

    write(id, data): void {
      const session = sessions.get(id);
      if (!session?.process || session.status !== "running") return;
      session.process.write(data);
    },

    resize(id, columns, rows): void {
      const item = getTerminal(id);
      updateTerminalData(id, { columns, rows }, { touchUpdatedAt: false });
      const session = sessions.get(id);
      if (session) {
        session.terminalState.resize(columns, rows);
        if (session.process && session.status === "running") session.process.resize(columns, rows);
      }
      void item;
    },

    async disposeItem(id): Promise<void> {
      const session = sessions.get(id);
      if (!session) return;
      await discardSession(session);
      sessions.delete(id);
    },

    async pruneMissingItems(): Promise<void> {
      const disposals: Promise<void>[] = [];
      for (const [id, session] of sessions) {
        if (getItemById(id)) continue;
        disposals.push(discardSession(session));
        sessions.delete(id);
      }
      await Promise.all(disposals);
    },

    async disposeAll(): Promise<void> {
      await Promise.all([...sessions.values()].map((session) => disposeSession(session, true)));
      sessions.clear();
    },
  };
}
