import { afterEach, describe, expect, it } from "vitest";

import { TerminalState } from "./terminal-state";

describe("TerminalState", () => {
  const states: TerminalState[] = [];

  afterEach(() => {
    for (const state of states) state.dispose();
    states.length = 0;
  });

  function createState(): TerminalState {
    const state = new TerminalState(80, 24);
    states.push(state);
    return state;
  }

  it("keeps active TUI state for live reconnects", async () => {
    const state = createState();
    state.write("shell prompt\r\n\x1b[?1049h\x1b[?1003hTUI");
    await state.whenIdle();

    const snapshot = state.serializeForLiveSession();

    expect(snapshot).toContain("\x1b[?1049h");
    expect(snapshot).toContain("\x1b[?1003h");
    expect(snapshot).toContain("TUI");
  });

  it("persists only the normal buffer without interaction modes", async () => {
    const state = createState();
    state.write("shell prompt\r\n\x1b[?1049h\x1b[?1003hTUI");
    await state.whenIdle();

    const persisted = state.serializeForRestart();
    const restored = createState();
    restored.write(persisted);
    await restored.whenIdle();
    const restoredSnapshot = restored.serializeForLiveSession();

    expect(persisted).not.toContain("\x1b[?1049h");
    expect(persisted).not.toContain("\x1b[?1003h");
    expect(restoredSnapshot).toContain("shell prompt");
    expect(restoredSnapshot).not.toContain("TUI");
    expect(restoredSnapshot).not.toContain("\x1b[?1049h");
    expect(restoredSnapshot).not.toContain("\x1b[?1003h");
  });
});
