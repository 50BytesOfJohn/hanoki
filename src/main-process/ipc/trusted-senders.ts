import type { IpcMainInvokeEvent, WebContents } from "electron";

import { currentRendererEntryUrl, isRendererEntryUrl } from "../app/renderer-entry";
import { AppError } from "./core/errors";

export function isTrustedRendererUrl(url: string): boolean {
  if (!url) return false;
  return isRendererEntryUrl(url, currentRendererEntryUrl());
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
