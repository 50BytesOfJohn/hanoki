import { describe, expect, it } from "vitest";

import { IPC_CHANNELS } from "@shared/ipc";
import { createUuidV7 } from "@shared/uuidv7";
import { DEFAULT_WORKSPACE_ID } from "@shared/workspace/workspace-id";

import { TERMINAL_PRELOAD_METHODS, createTerminalPreloadApi } from "./terminal-api";

describe("terminal preload", () => {
  it("exposes only the terminal methods the renderer calls", () => {
    const calls: Array<{ channel: string; args: Array<string | number | null> }> = [];
    const api = createTerminalPreloadApi((channel, ...args) => {
      calls.push({ channel, args });
      return Promise.resolve(undefined);
    });

    expect(Object.keys(api)).toEqual([...TERMINAL_PRELOAD_METHODS]);
    expect(api).not.toHaveProperty("killTerminal");
    expect(api).not.toHaveProperty("disposeTerminal");

    const id = createUuidV7();
    void api.createTerminal(DEFAULT_WORKSPACE_ID, "Terminal", null);
    void api.startTerminal(id);
    void api.writeTerminal(id, "ls\n");
    void api.resizeTerminal(id, 80, 24);

    expect(calls.map((call) => call.channel)).toEqual([
      IPC_CHANNELS.terminals.create,
      IPC_CHANNELS.terminals.start,
      IPC_CHANNELS.terminals.write,
      IPC_CHANNELS.terminals.resize,
    ]);
    expect(calls[2]?.args).toEqual([id, "ls\n"]);
    expect(calls[3]?.args).toEqual([id, 80, 24]);
  });

  it("rejects terminal arguments before they are sent", () => {
    const api = createTerminalPreloadApi(() => Promise.resolve(undefined));
    const id = createUuidV7();

    expect(() => api.createTerminal("not-a-workspace", "Terminal", null)).toThrow();
    expect(() => api.startTerminal("not-an-id")).toThrow();
    expect(() => api.writeTerminal(id, "x".repeat(65_537))).toThrow();
    expect(() => api.resizeTerminal(id, 1, 24)).toThrow();
    expect(() => api.resizeTerminal(id, 80.5, 24)).toThrow();
  });
});
