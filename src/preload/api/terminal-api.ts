import { IPC_CHANNELS, type IpcApi } from "@shared/ipc";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseChatId } from "@shared/chat/chat-id";
import { parseFolderId } from "@shared/folder/folder-id";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";

export const TERMINAL_PRELOAD_METHODS = [
  "createTerminal",
  "startTerminal",
  "writeTerminal",
  "resizeTerminal",
] as const;

const WRITE_LIMIT = 65_536;

type PreloadInvoke = (channel: string, ...args: Array<string | number | null>) => Promise<unknown>;

function parsed<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function terminalId(value: unknown): string {
  return parsed(parseChatId(value));
}

function dimension(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2 || value > 1_000) {
    throw new Error(`${label} must be an integer between 2 and 1000.`);
  }
  return value;
}

export function createTerminalPreloadApi(
  invoke: PreloadInvoke,
): Pick<IpcApi, "createTerminal" | "startTerminal" | "writeTerminal" | "resizeTerminal"> {
  return {
    createTerminal: (workspaceId, title, folderId) =>
      invoke(
        IPC_CHANNELS.terminals.create,
        parsed(parseWorkspaceId(workspaceId)),
        parsed(parseChatTitle(title)),
        folderId == null ? null : parsed(parseFolderId(folderId)),
      ) as ReturnType<IpcApi["createTerminal"]>,
    startTerminal: (id) =>
      invoke(IPC_CHANNELS.terminals.start, terminalId(id)) as ReturnType<IpcApi["startTerminal"]>,
    writeTerminal: (id, data) => {
      if (typeof data !== "string" || data.length > WRITE_LIMIT) {
        throw new Error("Terminal input must be a string no larger than 64 KiB.");
      }
      return invoke(IPC_CHANNELS.terminals.write, terminalId(id), data) as ReturnType<
        IpcApi["writeTerminal"]
      >;
    },
    resizeTerminal: (id, columns, rows) =>
      invoke(
        IPC_CHANNELS.terminals.resize,
        terminalId(id),
        dimension(columns, "columns"),
        dimension(rows, "rows"),
      ) as ReturnType<IpcApi["resizeTerminal"]>,
  };
}
