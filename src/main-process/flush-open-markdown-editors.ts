import { randomUUID } from "node:crypto";
import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import { MARKDOWN_FLUSH_EDITORS_ACK_CHANNEL, MARKDOWN_FLUSH_EDITORS_CHANNEL } from "@shared/events";

const FLUSH_TIMEOUT_MS = 5_000;

/** Asks each window to flush open TipTap notes, then resolves. No-op without windows. */
export function flushOpenMarkdownEditorsInRenderer(): Promise<void> {
  if (!BrowserWindow?.getAllWindows) return Promise.resolve();
  const windows = BrowserWindow.getAllWindows().filter(
    (window) => !window.isDestroyed() && !window.webContents.isDestroyed(),
  );
  if (windows.length === 0) return Promise.resolve();
  return Promise.all(windows.map(flushWindow)).then(() => undefined);
}

function flushWindow(window: BrowserWindow): Promise<void> {
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const onAck = (_event: IpcMainEvent, ackId: unknown) => {
      if (ackId !== requestId) return;
      finish();
    };
    const timer = setTimeout(finish, FLUSH_TIMEOUT_MS);
    function finish() {
      clearTimeout(timer);
      ipcMain.removeListener(MARKDOWN_FLUSH_EDITORS_ACK_CHANNEL, onAck);
      resolve();
    }
    ipcMain.on(MARKDOWN_FLUSH_EDITORS_ACK_CHANNEL, onAck);
    window.webContents.send(MARKDOWN_FLUSH_EDITORS_CHANNEL, requestId);
  });
}
