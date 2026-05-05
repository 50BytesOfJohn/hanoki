import type { IpcMainInvokeEvent, WebContents } from "electron";

import { AppError } from "./core/errors";

function isTrustedDevServerUrl(url: string): boolean {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return false;
  }

  try {
    const sender = new URL(url);
    const devServer = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return sender.origin === devServer.origin;
  } catch {
    return false;
  }
}

export function isTrustedRendererUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  if (isTrustedDevServerUrl(url)) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:";
  } catch {
    return false;
  }
}

export interface TrustedSenderRegistry {
  registerTrustedWebContents(webContents: Pick<WebContents, "id">): void;
  unregisterTrustedWebContents(webContentsId: number): void;
  assertTrustedIpcSender(event: IpcMainInvokeEvent): void;
}

export function createTrustedSenderRegistry(): TrustedSenderRegistry {
  const trustedWebContentsIds = new Set<number>();

  return {
    registerTrustedWebContents(webContents): void {
      trustedWebContentsIds.add(webContents.id);
    },

    unregisterTrustedWebContents(webContentsId): void {
      trustedWebContentsIds.delete(webContentsId);
    },

    assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
      const senderId = event.sender.id;
      const senderUrl = event.senderFrame?.url ?? event.sender.getURL() ?? "";

      if (!trustedWebContentsIds.has(senderId)) {
        throw AppError.forbidden(
          `Blocked IPC from unregistered webContents ${senderId} ("${senderUrl || "unknown"}").`,
        );
      }

      if (!isTrustedRendererUrl(senderUrl)) {
        throw AppError.forbidden(
          `Blocked IPC from untrusted sender URL "${senderUrl || "unknown"}".`,
        );
      }
    },
  };
}
