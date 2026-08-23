import { create } from "zustand";
import type { SystemEvent, SystemState, UpdateStateSnapshot } from "@shared/events";

interface AiServerState {
  status: "idle" | "starting" | "ready" | "error";
  port: number | null;
  error: string | null;
}

interface SystemStoreState {
  aiServer: AiServerState;
  update: UpdateStateSnapshot;
  handleSystemEvent: (event: SystemEvent) => void;
  syncState: (state: SystemState) => void;
}

export const useSystemStore = create<SystemStoreState>((set) => ({
  aiServer: {
    status: "idle",
    port: null,
    error: null,
  },
  update: {
    status: "unsupported",
    currentVersion: "",
    readyVersion: null,
    releaseNotes: null,
    error: null,
    checkedManually: false,
  },
  handleSystemEvent: (event) => {
    switch (event.type) {
      case "ai-server:starting":
        set({ aiServer: { status: "starting", port: null, error: null } });
        break;
      case "ai-server:ready":
        set({ aiServer: { status: "ready", port: event.port, error: null } });
        break;
      case "ai-server:error":
        set({ aiServer: { status: "error", port: null, error: event.error } });
        break;
      case "update:state":
        set({ update: event.update });
        break;
      case "providers:model-sync:completed":
      case "providers:start-model-sync:completed":
      case "item:title-updated":
        break;
    }
  },
  syncState: (state) => {
    set({ aiServer: state.aiServer, update: state.update });
  },
}));

export const selectAiServerPort = (state: SystemStoreState) => state.aiServer.port;
export const selectAiServerReady = (state: SystemStoreState) => state.aiServer.status === "ready";
export const selectUpdate = (state: SystemStoreState) => state.update;
