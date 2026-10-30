import { describe, expect, it } from "vitest";

import { groupTraceParts, type TraceEntry } from "./group-trace-parts";

function call(toolName: string, toolCallId: string, extra: object = {}) {
  return {
    type: "dynamic-tool",
    toolName,
    toolCallId,
    state: "output-available",
    input: {},
    output: {},
    ...extra,
  };
}

function summarize(entries: TraceEntry[]) {
  return entries.map((entry) =>
    entry.kind === "tools" ? `${entry.toolName}:${entry.parts.length}` : "reasoning",
  );
}

describe("groupTraceParts", () => {
  it("merges calls to the same tool, even with other steps between them", () => {
    const entries = groupTraceParts(
      [call("rename", "1"), call("read", "2"), call("rename", "3"), call("rename", "4")],
      false,
    );

    expect(summarize(entries)).toEqual(["rename:3", "read:1"]);
  });

  it("keeps a call waiting on the user out of its group", () => {
    const entries = groupTraceParts(
      [
        call("rename", "1"),
        call("rename", "2", {
          state: "approval-requested",
          approval: { id: "a", isAutomatic: false },
        }),
      ],
      true,
    );

    expect(summarize(entries)).toEqual(["rename:1", "rename:1"]);
  });

  it("joins reasoning into one row that runs while any of it streams", () => {
    const entries = groupTraceParts(
      [
        { type: "reasoning", text: "First.", state: "done" },
        call("read", "1"),
        { type: "reasoning", text: "Second.", state: "streaming" },
      ],
      true,
    );

    expect(entries[0]).toMatchObject({
      kind: "reasoning",
      text: "First.\n\nSecond.",
      running: true,
    });
    expect(entries).toHaveLength(2);
  });
});
