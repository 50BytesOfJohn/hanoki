import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/*
 * Conway's Game of Life on a wrapped 3×3 board — the "this chat is streaming"
 * marker in the tree and the tab strip.
 *
 * Nine cells is small enough that the board freezes or dies within a handful of
 * generations, so it reseeds itself whenever that happens. The churn is the
 * point: a loop the eye can learn stops reading as activity after two cycles,
 * and a stalled stream then looks exactly like a running one. Each indicator
 * seeds independently, so two streaming chats never move in step.
 */
const SIZE = 3;
const CELL_COUNT = SIZE * SIZE;
const GENERATION_MS = 300;
// Oscillators (a blinker on a torus) would otherwise repeat forever.
const MAX_GENERATIONS = 30;
const DEAD_OPACITY = 0.12;

export type Board = boolean[];

function countAlive(board: Board) {
  return board.reduce((total, alive) => total + (alive ? 1 : 0), 0);
}

export function seedBoard(): Board {
  let board: Board;
  do {
    board = Array.from({ length: CELL_COUNT }, () => Math.random() < 0.5);
  } while (countAlive(board) < 3); // a two-cell board is dead on arrival
  return board;
}

export function nextGeneration(board: Board): Board {
  return board.map((alive, index) => {
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);

    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = (x + dx + SIZE) % SIZE;
        const ny = (y + dy + SIZE) % SIZE;
        if (board[ny * SIZE + nx]) neighbours++;
      }
    }

    return neighbours === 3 || (neighbours === 2 && alive);
  });
}

export function ChatActivityIndicator({ className }: { className?: string }) {
  const [state, setState] = useState(() => ({ board: seedBoard(), generation: 0 }));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return; // leave the seeded board on screen, static
    }

    const timer = setInterval(() => {
      setState(({ board, generation }) => {
        const next = nextGeneration(board);
        const stalled = next.every((alive, index) => alive === board[index]);

        if (stalled || countAlive(next) < 2 || generation >= MAX_GENERATIONS) {
          return { board: seedBoard(), generation: 0 };
        }

        return { board: next, generation: generation + 1 };
      });
    }, GENERATION_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <span
      role="status"
      aria-label="Streaming"
      className={cn(
        // Tracks are sized to the cell, not 1fr — otherwise the three columns
        // stretch across the whole 14px slot and the grid reads twice as big as
        // it is. The 14px box only exists to keep the row aligned with the
        // chat icon it replaces; the grid itself is 9.5px, centred.
        "grid size-3.5 shrink-0 grid-cols-[repeat(3,2.5px)] grid-rows-[repeat(3,2.5px)] place-content-center gap-px",
        className,
      )}
    >
      {state.board.map((alive, index) => (
        <span
          key={index}
          // 2.5px cells and 1px gaps: a 9.5px grid inside the 14px icon slot.
          // Square, not rounded — at this size a radius just makes them mush.
          className="size-[2.5px] bg-current transition-opacity duration-200 ease-out"
          style={{ opacity: alive ? 1 : DEAD_OPACITY }}
        />
      ))}
    </span>
  );
}
