import { describe, expect, it } from "vitest";

import { nextGeneration, seedBoard, type Board } from "./chat-activity-indicator";

const board = (rows: string) => [...rows.replaceAll("\n", "").trim()].map((c) => c === "#");
const render = (b: Board) => b.map((alive) => (alive ? "#" : ".")).join("");

describe("nextGeneration", () => {
  it("keeps a block alive — every cell has exactly two or three neighbours on a 3x3 torus", () => {
    const block = board("##.##....");
    expect(render(nextGeneration(block))).toBe(render(block));
  });

  it("wraps at the edges", () => {
    // A full row on a 3-wide torus gives every dead cell exactly three
    // neighbours, so the board fills — then every cell has eight and it empties.
    const filled = nextGeneration(board("###......"));
    expect(render(filled)).toBe("#########");
    expect(render(nextGeneration(filled))).toBe(".........");
  });

  it("kills an isolated cell", () => {
    expect(render(nextGeneration(board("#........")))).toBe(".........");
  });
});

describe("seedBoard", () => {
  it("never returns a board too sparse to run", () => {
    for (let i = 0; i < 200; i++) {
      expect(seedBoard().filter(Boolean).length).toBeGreaterThanOrEqual(3);
    }
  });
});
