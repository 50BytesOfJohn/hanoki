import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { isRendererEntryUrl, rendererEntryUrl, windowOpenDecision } from "./renderer-entry";

const DEV_ENTRY = rendererEntryUrl("http://localhost:5173", "/unused/index.html");
const PROD_INDEX = "/app/renderer/main_window/index.html";
const PROD_ENTRY = rendererEntryUrl(undefined, PROD_INDEX);

describe("renderer navigation", () => {
  it("allows only the exact app entry URL", () => {
    expect(DEV_ENTRY).toBe("http://localhost:5173/");
    expect(isRendererEntryUrl("http://localhost:5173/", DEV_ENTRY)).toBe(true);
    expect(isRendererEntryUrl("http://localhost:5173/#/chat/1", DEV_ENTRY)).toBe(true);
    expect(isRendererEntryUrl("http://localhost:5173/other", DEV_ENTRY)).toBe(false);
    expect(isRendererEntryUrl("https://example.com/", DEV_ENTRY)).toBe(false);

    expect(PROD_ENTRY).toBe(pathToFileURL(PROD_INDEX).href);
    expect(isRendererEntryUrl(`${PROD_ENTRY}#/settings`, PROD_ENTRY)).toBe(true);
    expect(isRendererEntryUrl("file:///etc/passwd", PROD_ENTRY)).toBe(false);
    expect(
      isRendererEntryUrl(pathToFileURL("/app/renderer/main_window/other.html").href, PROD_ENTRY),
    ).toBe(false);
  });

  it("denies new windows and does not open blocked schemes", () => {
    const opened: string[] = [];
    const open = (url: string) => {
      opened.push(url);
    };

    expect(windowOpenDecision("https://example.com/docs", open)).toEqual({ action: "deny" });
    expect(windowOpenDecision("javascript:alert(1)", open)).toEqual({ action: "deny" });
    expect(windowOpenDecision("file:///etc/passwd", open)).toEqual({ action: "deny" });
    expect(windowOpenDecision("smb://server/share", open)).toEqual({ action: "deny" });
    expect(windowOpenDecision("myapp://open", open)).toEqual({ action: "deny" });
    expect(opened).toEqual(["https://example.com/docs"]);
  });

  it("treats loadFile and pathToFileURL spellings of the same path as the entry", () => {
    const paths = [
      path.join("/tmp", "hanoki pct%", "index.html"),
      path.join("/tmp", "hanoki brack[et]", "index.html"),
      path.join("/tmp", "hanoki ca^ret", "index.html"),
      path.join("/tmp", "hanoki space dir", "index.html"),
      path.join("/tmp", "hanoki café", "index.html"),
      path.join("/tmp", "hanoki 日本語", "index.html"),
    ];

    for (const filePath of paths) {
      const entry = rendererEntryUrl(undefined, filePath);
      const loaded = pathToFileURL(filePath)
        .href.replaceAll("%5B", "[")
        .replaceAll("%5D", "]")
        .replaceAll("%25", "%");
      expect(isRendererEntryUrl(loaded, entry)).toBe(true);
      expect(isRendererEntryUrl(`${loaded}#/chat/1`, entry)).toBe(true);
    }

    const entry = rendererEntryUrl(undefined, "/tmp/app/index.html");
    expect(isRendererEntryUrl("file://evilhost/tmp/app/index.html", entry)).toBe(false);
  });
});
