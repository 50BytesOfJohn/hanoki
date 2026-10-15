import { describe, expect, it } from "vitest";

import {
  HANOKI_ASSET_SCHEME,
  imageDisplaySrc,
  isNoteLocalImageSrc,
  noteImageUrl,
  parseNoteImageUrl,
} from "./protocol";

const target = { workspaceId: "workspace", itemId: "note" };

describe("note image urls", () => {
  it("rewrites note-relative sources and leaves remote sources alone", () => {
    expect(isNoteLocalImageSrc("fern.png")).toBe(true);
    expect(isNoteLocalImageSrc("../shared.png")).toBe(true);
    expect(isNoteLocalImageSrc("file:///tmp/fern.png")).toBe(true);
    expect(isNoteLocalImageSrc("https://example.com/fern.png")).toBe(false);
    expect(isNoteLocalImageSrc("data:image/png;base64,aaaa")).toBe(false);

    const display = imageDisplaySrc("img/fern.png", target);
    expect(display.startsWith(`${HANOKI_ASSET_SCHEME}:`)).toBe(true);
    expect(parseNoteImageUrl(display)).toEqual({
      workspaceId: "workspace",
      itemId: "note",
      src: "img/fern.png",
    });
    expect(imageDisplaySrc("https://example.com/fern.png", target)).toBe(
      "https://example.com/fern.png",
    );
    expect(imageDisplaySrc("javascript:alert(1)", target)).toBe("");
  });

  it("keeps an encoded relative path in the query", () => {
    const url = noteImageUrl("workspace", "note", "%2e%2e/secret.png");
    expect(parseNoteImageUrl(url)?.src).toBe("%2e%2e/secret.png");
    expect(
      parseNoteImageUrl(`${HANOKI_ASSET_SCHEME}://asset/workspace/note?src=..%2Fsecret.png`)?.src,
    ).toBe("../secret.png");
  });
});
