import { shell } from "electron";

import { externalUrlToOpen } from "@shared/external-url";

export async function openExternalUrl(url: string): Promise<void> {
  const allowed = externalUrlToOpen(url);
  if (!allowed) return;
  await shell.openExternal(allowed);
}
