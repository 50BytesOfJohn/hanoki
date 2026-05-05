import { ipcRenderer } from "electron";

export function invokeIpc<TResult>(channel: string, ...args: unknown[]): Promise<TResult> {
  return ipcRenderer.invoke(channel, ...args) as Promise<TResult>;
}
