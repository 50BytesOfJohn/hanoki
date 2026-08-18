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

export interface TerminalService {
  create(input: { workspaceId: string; title: string; folderId: string | null }): TerminalInfo;
  start(id: string, sender: WebContents): Promise<TerminalSessionSnapshot>;
  write(id: string, data: string): void;
  resize(id: string, columns: number, rows: number): void;
  disposeItem(id: string): Promise<void>;
  pruneMissingItems(): Promise<void>;
  disposeAll(): Promise<void>;
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
