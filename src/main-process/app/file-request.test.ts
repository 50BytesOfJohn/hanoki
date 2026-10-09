import { describe, expect, it } from "vitest";

import { fileRequestHasHost } from "./file-request";

describe("fileRequestHasHost", () => {
  it("is true for every file url with a host", () => {
    expect(fileRequestHasHost("file://evilhost/tmp/a.png")).toBe(true);
    expect(fileRequestHasHost("file://evilhost/tmp/a.css")).toBe(true);
    expect(fileRequestHasHost("file://evilhost/tmp/a.woff")).toBe(true);
    expect(fileRequestHasHost("file://evilhost/tmp/a.mp4")).toBe(true);
    expect(fileRequestHasHost("file://127.0.0.1/tmp/a.json")).toBe(true);
    expect(fileRequestHasHost("file:///tmp/a.png")).toBe(false);
    expect(fileRequestHasHost("file://localhost/tmp/a.png")).toBe(false);
    expect(fileRequestHasHost("https://example.com/a.png")).toBe(false);
  });
});
