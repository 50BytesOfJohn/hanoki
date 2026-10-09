import path from "node:path";
import { pathToFileURL } from "node:url";

import { externalUrlToOpen } from "@shared/external-url";

export function rendererIndexHtmlPath(dirname: string, viteName: string): string {
  return path.join(dirname, `../renderer/${viteName}/index.html`);
}

export function rendererEntryUrl(devServerUrl: string | undefined, indexHtmlPath: string): string {
  if (devServerUrl) return new URL(devServerUrl).href;
  return pathToFileURL(indexHtmlPath).href;
}

export function currentRendererEntryUrl(): string {
  return rendererEntryUrl(
    MAIN_WINDOW_VITE_DEV_SERVER_URL,
    rendererIndexHtmlPath(__dirname, MAIN_WINDOW_VITE_NAME),
  );
}

export function isRendererEntryUrl(url: string, entryUrl: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(entryUrl);
    actual.hash = "";
    expected.hash = "";
    return actual.href === expected.href;
  } catch {
    return false;
  }
}

export function windowOpenDecision(url: string, open: (url: string) => void): { action: "deny" } {
  const allowed = externalUrlToOpen(url);
  if (allowed) open(allowed);
  return { action: "deny" };
}
