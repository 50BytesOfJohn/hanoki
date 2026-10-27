import { describe, expect, it } from "vitest";

import { decideToolApproval, normalizeAllowedTools } from "./tool-approval";

const ask = { computerToolsAlwaysAllowed: false };

describe("decideToolApproval", () => {
  it("lets reads and creates run without an approval flow", () => {
    expect(decideToolApproval("hanokiReadNote", ask)).toEqual({ type: "not-applicable" });
    expect(decideToolApproval("hanokiCreateChat", { ...ask, mode: "allow-all" })).toEqual({
      type: "not-applicable",
    });
  });

  it("asks for workspace and computer changes by default", () => {
    expect(decideToolApproval("hanokiRenameItem", ask)).toEqual({ type: "user-approval" });
    expect(decideToolApproval("hanokiTerminalRun", ask)).toEqual({ type: "user-approval" });
  });

  it("approves only the tools allowed for the chat", () => {
    const policy = { ...ask, allowedTools: ["hanokiMoveItems"] };
    expect(decideToolApproval("hanokiMoveItems", policy)).toMatchObject({ type: "approved" });
    expect(decideToolApproval("hanokiDeleteItems", policy)).toEqual({ type: "user-approval" });
  });

  it("approves everything in allow-all mode", () => {
    for (const name of ["hanokiDeleteItems", "terminalRun", "hanokiSendMessage"]) {
      expect(decideToolApproval(name, { ...ask, mode: "allow-all" })).toMatchObject({
        type: "approved",
      });
    }
  });

  it("applies the app-wide terminal setting to every computer tool, not workspace ones", () => {
    const policy = { computerToolsAlwaysAllowed: true };
    expect(decideToolApproval("terminalRun", policy)).toMatchObject({ type: "approved" });
    expect(decideToolApproval("hanokiTerminalWrite", policy)).toMatchObject({ type: "approved" });
    expect(decideToolApproval("hanokiEditNote", policy)).toEqual({ type: "user-approval" });
  });
});

describe("normalizeAllowedTools", () => {
  it("drops unknown names and duplicates", () => {
    expect(normalizeAllowedTools(["terminalRun", "nope", "terminalRun", 3])).toEqual([
      "terminalRun",
    ]);
  });
});
