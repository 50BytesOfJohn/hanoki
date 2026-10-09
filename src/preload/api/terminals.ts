import type { IpcApi } from "@shared/ipc";
import { invokeIpc } from "../invoke";
import { createTerminalPreloadApi } from "./terminal-api";

type TerminalsApi = Pick<
  IpcApi,
  "createTerminal" | "startTerminal" | "writeTerminal" | "resizeTerminal"
>;

export function createTerminalsApi(): TerminalsApi {
  return createTerminalPreloadApi(invokeIpc);
}
