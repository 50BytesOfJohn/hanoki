import { BrowserWindow } from "electron";
import { SYSTEM_EVENT_CHANNEL, type MarkdownBodiesRewrittenEvent } from "@shared/events";

export function broadcastMarkdownBodiesRewritten(workspaceId: string, itemIds: string[]): void {
  if (itemIds.length === 0) return;
  const event: MarkdownBodiesRewrittenEvent = {
    type: "markdown:bodies-rewritten",
    workspaceId,
    itemIds,
  };

  if (!BrowserWindow?.getAllWindows) return;

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(SYSTEM_EVENT_CHANNEL, event);
  }
}
