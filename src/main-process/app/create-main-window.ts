import { app, BrowserWindow, type Session } from "electron";
import path from "node:path";

import { rendererHeaderContentSecurityPolicy } from "./content-security-policy";
import { fileRequestHasHost } from "./file-request";
import { openExternalUrl } from "./open-external";
import { currentRendererEntryUrl, isRendererEntryUrl, windowOpenDecision } from "./renderer-entry";
import { type TrustedSenderRegistry } from "../ipc/trusted-senders";
import { WINDOW_TOOLBAR_HEIGHT, WINDOW_TRAFFIC_LIGHTS_POSITION } from "@shared/window-chrome";
import { createPersistentWindowState } from "../lib/persistent-window-state";

let contentSecurityPolicyInstalled = false;

function installRendererContentSecurityPolicy(
  webSession: Session,
  mode: "dev" | "prod",
  localServerPort: () => number | null,
): void {
  if (contentSecurityPolicyInstalled) return;
  contentSecurityPolicyInstalled = true;
  webSession.webRequest.onBeforeRequest({ urls: ["file://*/*"] }, (details, callback) => {
    callback(fileRequestHasHost(details.url) ? { cancel: true } : {});
  });
  webSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "mainFrame") {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [rendererHeaderContentSecurityPolicy(mode, localServerPort())],
      },
    });
  });
}

export interface CreateMainWindowOptions {
  trustedSenders: TrustedSenderRegistry;
  onClosed?: () => void;
  localServerPort: () => number | null;
}

function getMainWindowIconPath(): string | undefined {
  if (process.platform === "linux") {
    return app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.join(__dirname, "../../assets/icons/icon.png");
  }

  if (process.platform === "win32") {
    return path.join(__dirname, "../../assets/icons/icon.ico");
  }

  return undefined;
}

export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
  const isMac = process.platform === "darwin";
  const windowIconPath = getMainWindowIconPath();
  const windowState = createPersistentWindowState({
    windowId: "main",
    defaultSize: {
      width: 800,
      height: 600,
    },
  });

  const mainWindow = new BrowserWindow({
    ...windowState.browserWindowOptions,
    autoHideMenuBar: process.platform === "linux",
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: WINDOW_TRAFFIC_LIGHTS_POSITION,
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#ffffff",
            height: WINDOW_TOOLBAR_HEIGHT,
          },
        }
      : {}),
    title: "Hanoki",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  options.trustedSenders.registerTrustedWebContents(mainWindow.webContents);

  windowState.attach(mainWindow);

  mainWindow.on("closed", () => {
    options.onClosed?.();
  });

  mainWindow.webContents.on("destroyed", () => {
    options.trustedSenders.unregisterTrustedWebContents(mainWindow.webContents.id);
  });

  const entryUrl = currentRendererEntryUrl();
  installRendererContentSecurityPolicy(
    mainWindow.webContents.session,
    MAIN_WINDOW_VITE_DEV_SERVER_URL ? "dev" : "prod",
    options.localServerPort,
  );
  mainWindow.webContents.setWindowOpenHandler(({ url }) =>
    windowOpenDecision(url, (allowed) => {
      void openExternalUrl(allowed);
    }),
  );
  const allowEntry = (event: { preventDefault(): void }, url: string) => {
    if (!isRendererEntryUrl(url, entryUrl)) event.preventDefault();
  };
  mainWindow.webContents.on("will-navigate", allowEntry);
  mainWindow.webContents.on("will-redirect", allowEntry);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
}
