import { describe, expect, it } from "vitest";
import { findChangedRange, findFixableLines } from "./grammar-fix-text-control";

describe("findFixableLines", () => {
  it("skips blank lines, fence markers, and fenced content", () => {
    expect(
      findFixableLines(["first", "", "```ts", "const teh = 1;", "```", "  ", "  last"]),
    ).toEqual([0, 6]);
  });
});

describe("findChangedRange", () => {
  it("narrows to the differing part", () => {
    expect(findChangedRange("their going", "they're going")).toEqual({
      start: 3,
      sourceEnd: 5,
      nextEnd: 7,
    });
  });

  it("handles repeated characters at the boundary", () => {
    const range = findChangedRange("aaa", "aaaa");
    expect(range.nextEnd - range.start - (range.sourceEnd - range.start)).toBe(1);
  });

  it("does not split a surrogate pair", () => {
    // 😀 and 😁 share a high surrogate, 🌀 shares neither half with them.
    const prefix = findChangedRange("a😀", "a😁");
    expect("a😁".slice(prefix.start, prefix.nextEnd)).toBe("😁");

    const suffix = findChangedRange("🌍b", "🜍b");
    expect(suffix.nextEnd).toBeGreaterThanOrEqual(2);
    expect("🜍b".slice(suffix.start, suffix.nextEnd)).toBe("🜍");
  });
});
