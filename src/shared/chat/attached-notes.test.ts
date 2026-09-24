import { describe, expect, it } from "vitest";

import {
  ATTACHED_NOTE_CHAR_LIMIT,
  ATTACHED_NOTES_TOTAL_CHAR_LIMIT,
  addingNoteExceedsTotal,
  dedupeItemIds,
  estimateTokens,
  formatAttachedNotesBlock,
  packAttachedNotes,
} from "./attached-notes";

describe("packAttachedNotes", () => {
  it("keeps a short note in full and marks an over-cap note", () => {
    const packed = packAttachedNotes([
      { itemId: "a", title: "Short", body: "hello" },
      { itemId: "b", title: "Long", body: "x".repeat(ATTACHED_NOTE_CHAR_LIMIT + 25) },
    ]);

    expect(packed[0]).toMatchObject({ status: "ok", injectedChars: 5, excerpt: "hello" });
    expect(packed[1]).toMatchObject({
      status: "truncated",
      fullChars: ATTACHED_NOTE_CHAR_LIMIT + 25,
      injectedChars: ATTACHED_NOTE_CHAR_LIMIT,
    });
  });

  it("truncates newest notes first once the total cap is passed", () => {
    const packed = packAttachedNotes([
      { itemId: "old", title: "Old", body: "o".repeat(ATTACHED_NOTE_CHAR_LIMIT) },
      { itemId: "mid", title: "Mid", body: "m".repeat(ATTACHED_NOTE_CHAR_LIMIT) },
      { itemId: "new", title: "New", body: "n".repeat(ATTACHED_NOTE_CHAR_LIMIT) },
      { itemId: "newer", title: "Newer", body: "p".repeat(100) },
    ]);

    expect(packed[0]?.status).toBe("ok");
    expect(packed[1]?.status).toBe("ok");
    expect(packed[2]?.status).toBe("ok");
    expect(packed[3]).toMatchObject({ status: "truncated", injectedChars: 0, fullChars: 100 });
    expect(packed.reduce((sum, note) => sum + note.injectedChars, 0)).toBe(
      ATTACHED_NOTES_TOTAL_CHAR_LIMIT,
    );
  });

  it("does not invent a body for a missing note", () => {
    const packed = packAttachedNotes([
      { itemId: "gone", title: "Gone", body: null, error: "missing" },
    ]);
    expect(packed[0]).toMatchObject({ status: "error", excerpt: "", injectedChars: 0 });
    expect(formatAttachedNotesBlock(packed)).toBe("");
  });

  it("wraps injected text with provenance and a visible truncation marker", () => {
    const block = formatAttachedNotesBlock(
      packAttachedNotes([{ itemId: "n1", title: 'Canon "A"', body: "body" }]),
    );
    expect(block).toContain('title="Canon &quot;A&quot;"');
    expect(block).toContain('Attached note: Canon "A" (n1)');
    expect(block).toContain("body");
    expect(block).not.toContain("instructions to follow");
  });
});

describe("attached note helpers", () => {
  it("de-dupes item ids in order", () => {
    expect(dedupeItemIds(["a", "b", "a", "", 1, "c"])).toEqual(["a", "b", "c"]);
  });

  it("asks for confirm only when the total cap would cut the new note", () => {
    const current = [
      { itemId: "a", title: "A", body: "a".repeat(ATTACHED_NOTE_CHAR_LIMIT) },
      { itemId: "b", title: "B", body: "b".repeat(ATTACHED_NOTE_CHAR_LIMIT) },
      { itemId: "c", title: "C", body: "c".repeat(ATTACHED_NOTE_CHAR_LIMIT) },
    ];
    expect(
      addingNoteExceedsTotal(current, {
        itemId: "d",
        title: "D",
        body: "d".repeat(100),
      }),
    ).toBe(true);
    expect(
      addingNoteExceedsTotal([{ itemId: "a", title: "A", body: "short" }], {
        itemId: "b",
        title: "B",
        body: "x".repeat(ATTACHED_NOTE_CHAR_LIMIT + 10),
      }),
    ).toBe(false);
  });

  it("estimates tokens as ceil(chars/4)", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(8)).toBe(2);
  });
});
