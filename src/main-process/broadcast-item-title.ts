import { BrowserWindow } from "electron";
import { SYSTEM_EVENT_CHANNEL, type ItemTitleUpdatedEvent } from "@shared/events";

export function broadcastItemTitleUpdated(item: {
  id: string;
  type: ItemTitleUpdatedEvent["itemType"];
  workspaceId: string;
  title: string;
}): void {
  const event: ItemTitleUpdatedEvent = {
    type: "item:title-updated",
    itemId: item.id,
    itemType: item.type,
    workspaceId: item.workspaceId,
    title: item.title,
  };

  if (!BrowserWindow?.getAllWindows) return;

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(SYSTEM_EVENT_CHANNEL, event);
  }
}
