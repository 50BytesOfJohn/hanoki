import { describe, expect, it } from "vitest";

import { isNonHttpRemoteImageUrl, isRemoteImageUrl } from "./assistant-images";

describe("isRemoteImageUrl", () => {
  it("treats protocol-relative and file-host images as remote", () => {
    expect(isRemoteImageUrl("//cdn.example.com/a.png")).toBe(true);
    expect(isRemoteImageUrl("file://files.example/a.png")).toBe(true);
    expect(isNonHttpRemoteImageUrl("//cdn.example.com/a.png")).toBe(true);
    expect(isNonHttpRemoteImageUrl("file://files.example/a.png")).toBe(true);
    expect(isRemoteImageUrl("https://example.com/a.png")).toBe(true);
    expect(isNonHttpRemoteImageUrl("https://example.com/a.png")).toBe(false);
    expect(isRemoteImageUrl("file:///tmp/a.png")).toBe(false);
    expect(isNonHttpRemoteImageUrl("file:///tmp/a.png")).toBe(false);
    expect(isRemoteImageUrl("./shot.png")).toBe(false);
  });
});
