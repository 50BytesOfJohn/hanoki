import { ipcRenderer } from "electron";
import {
  SYSTEM_EVENT_CHANNEL,
  SYSTEM_STATE_CHANNEL,
  type SystemEvent,
  type SystemState,
} from "@shared/events";

export function createEventsApi() {
  return {
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
