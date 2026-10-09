import { describe, expect, it } from "vitest";

import { externalUrlToOpen } from "./external-url";

describe("externalUrlToOpen", () => {
  it("allows https, http, and mailto", () => {
    expect(externalUrlToOpen("https://example.com/docs")).toBe("https://example.com/docs");
    expect(externalUrlToOpen("http://example.com")).toBe("http://example.com/");
    expect(externalUrlToOpen("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });

  it("rejects javascript, file, smb, and custom schemes", () => {
    expect(externalUrlToOpen("javascript:alert(1)")).toBeNull();
    expect(externalUrlToOpen("file:///etc/passwd")).toBeNull();
    expect(externalUrlToOpen("smb://server/share")).toBeNull();
    expect(externalUrlToOpen("myapp://open")).toBeNull();
    expect(externalUrlToOpen("data:text/html,hi")).toBeNull();
  });
});
