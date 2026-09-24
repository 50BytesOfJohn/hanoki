export const isMac = globalThis.window?.electronAPI?.platform === "darwin";

export function modShortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}
