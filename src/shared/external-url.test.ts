import { describe, expect, it } from "vitest";

import { externalUrlToOpen } from "./external-url";

describe("externalUrlToOpen", () => {
  it("allows https, http, and mailto", () => {
    expect(externalUrlToOpen("https://example.com/docs")).toBe("https://example.com/docs");
    expect(externalUrlToOpen("http://example.com")).toBe("http://example.com/");
    expect(externalUrlToOpen("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });

  it("rejects credentials and drops mailto parameters other than subject, body, cc, and bcc", () => {
    expect(externalUrlToOpen("https://user:pass@example.com/docs")).toBeNull();
    expect(externalUrlToOpen("http://user:pass@example.com/")).toBeNull();
    expect(
      externalUrlToOpen("mailto:hello@example.com?subject=Hi&attach=/tmp/x&body=Yo&cc=c@d.com"),
    ).toBe("mailto:hello@example.com?subject=Hi&body=Yo&cc=c%40d.com");
    expect(externalUrlToOpen("mailto:hello@example.com?attach=/tmp/x")).toBe(
      "mailto:hello@example.com",
    );
    expect(externalUrlToOpen("mailto:x%3Fattach=secret@example.com")).toBeNull();
    expect(externalUrlToOpen("mailto:x%253Fattach=secret@example.com")).toBeNull();
    expect(externalUrlToOpen("mailto:hello@example.com?Subject=Hi&BODY=Yo&Attach=/tmp/a")).toBe(
      "mailto:hello@example.com?subject=Hi&body=Yo",
    );
    expect(externalUrlToOpen("mailto:hello%40example.com?subject=Hi")).toBe(
      "mailto:hello@example.com?subject=Hi",
    );
  });

  it("rejects javascript, file, smb, and custom schemes", () => {
    expect(externalUrlToOpen("javascript:alert(1)")).toBeNull();
    expect(externalUrlToOpen("file:///etc/passwd")).toBeNull();
    expect(externalUrlToOpen("smb://server/share")).toBeNull();
    expect(externalUrlToOpen("myapp://open")).toBeNull();
    expect(externalUrlToOpen("data:text/html,hi")).toBeNull();
  });
});
