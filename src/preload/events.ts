import { ipcRenderer } from "electron";
import {
  SYSTEM_EVENT_CHANNEL,
  SYSTEM_STATE_CHANNEL,
  type SystemEvent,
  type SystemState,
} from "@shared/events";
import { TERMINAL_EVENT_CHANNEL, type TerminalEvent } from "@shared/ipc";

export function createEventsApi() {
  return {
    onTerminalEvent: (callback: (event: TerminalEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: TerminalEvent) => callback(data);
      ipcRenderer.on(TERMINAL_EVENT_CHANNEL, handler);
      return () => ipcRenderer.removeListener(TERMINAL_EVENT_CHANNEL, handler);
    },
    onSystemEvent: (callback: (event: SystemEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: SystemEvent) => {
        callback(data);
      };

      ipcRenderer.on(SYSTEM_EVENT_CHANNEL, handler);

      return () => {
        ipcRenderer.removeListener(SYSTEM_EVENT_CHANNEL, handler);
      };
    },
    getSystemState: (): Promise<SystemState> => {
      return ipcRenderer.invoke(SYSTEM_STATE_CHANNEL);
    },
  };
}
