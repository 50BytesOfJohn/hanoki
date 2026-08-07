import { describe, expect, it } from "vitest";

import { appendContinuationParts, getContinuationParts } from "./continuation";
import type { HanokiUiMessage } from "./message-metadata";

type Parts = HanokiUiMessage["parts"];

const storedParts = [
  { type: "text", text: "The first half of the answer.", state: "done" },
] as unknown as Parts;

describe("getContinuationParts", () => {
  it("returns only what the model added past the seeded message", () => {
    const responseParts = [
      ...storedParts,
      { type: "text", text: " The second half.", state: "done" },
    ] as unknown as Parts;

    expect(getContinuationParts(storedParts, responseParts)).toEqual([
      { type: "text", text: " The second half.", state: "done" },
    ]);
  });

  it("does not re-append the original when the seed differs from the stored copy", () => {
    // The client's in-memory copy can drift from the database copy (a stopped
    // generation, a previously failed continuation). Comparing part contents
    // used to fail here and treat the whole response as new.
    const seedParts = [
      { type: "step-start" },
      { type: "text", text: "The first half of the answer.", state: "done" },
    ] as unknown as Parts;
    const responseParts = [
      ...seedParts,
      { type: "text", text: " The second half.", state: "done" },
    ] as unknown as Parts;

    const continuationParts = getContinuationParts(seedParts, responseParts);
    const merged = appendContinuationParts(storedParts, continuationParts);

    expect(merged).toEqual([
      { type: "text", text: "The first half of the answer. The second half.", state: "done" },
    ]);
  });

  it("drops step-start markers so they cannot accumulate across continuations", () => {
    const responseParts = [
      ...storedParts,
      { type: "step-start" },
      { type: "text", text: " More.", state: "done" },
    ] as unknown as Parts;

    expect(getContinuationParts(storedParts, responseParts)).toEqual([
      { type: "text", text: " More.", state: "done" },
    ]);
  });

  it("returns nothing when the model produced no new parts", () => {
    expect(getContinuationParts(storedParts, storedParts)).toEqual([]);
  });
});

describe("appendContinuationParts", () => {
  it("splices the continuation onto the trailing text part", () => {
    const merged = appendContinuationParts(storedParts, [
      { type: "text", text: " The second half.", state: "done" },
    ] as unknown as Parts);

    expect(merged).toEqual([
      { type: "text", text: "The first half of the answer. The second half.", state: "done" },
    ]);
  });

  it("keeps the stored parts untouched when there is nothing to append", () => {
    expect(appendContinuationParts(storedParts, [] as unknown as Parts)).toEqual(storedParts);
  });

  it("appends non-text continuation parts after the stored parts", () => {
    const merged = appendContinuationParts(storedParts, [
      { type: "reasoning", text: "thinking", state: "done" },
      { type: "text", text: " Done.", state: "done" },
    ] as unknown as Parts);

    expect(merged).toEqual([
      { type: "text", text: "The first half of the answer. Done.", state: "done" },
      { type: "reasoning", text: "thinking", state: "done" },
    ]);
  });

  it("does not mutate its inputs", () => {
    const original = structuredClone(storedParts);
    appendContinuationParts(storedParts, [
      { type: "text", text: " tail", state: "done" },
    ] as unknown as Parts);

    expect(storedParts).toEqual(original);
  });
});
