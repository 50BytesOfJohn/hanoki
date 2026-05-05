import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import started from "electron-squirrel-startup";
import { bootstrapBackend } from "./main-process/app/bootstrap-backend";
import { createMainWindow } from "./main-process/app/create-main-window";
import { closeAppDatabase } from "./main-process/db/database";
import { registerIpcHandlers } from "./main-process/ipc";
import { createAiServer } from "./main-process/server";
import { getDefaultAppIdentifier } from "./main-process/system/paths";
import {
  SYSTEM_EVENT_CHANNEL,
  SYSTEM_STATE_CHANNEL,
  type SystemEvent,
  type SystemState,
} from "./shared/events";

const APP_NAME = "Hanoki";
const APP_IDENTIFIER = getDefaultAppIdentifier();

app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), APP_IDENTIFIER));

if (process.platform === "win32") {
  app.setAppUserModelId(APP_IDENTIFIER);
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Enforce a single running instance. If a second instance is launched,
// focus the existing window and quit the new one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let backend: ReturnType<typeof bootstrapBackend> | null = null;
  let aiServer: { port: number; close: () => void } | null = null;
  let aiServerState: SystemState["aiServer"] = { status: "idle", port: null, error: null };

  function broadcastSystemEvent(event: SystemEvent) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(SYSTEM_EVENT_CHANNEL, event);
    }
  }

  function getSystemState(): SystemState {
    return { aiServer: aiServerState };
  }

  async function startAiServer() {
    try {
      aiServerState = { status: "starting", port: null, error: null };
      broadcastSystemEvent({ type: "ai-server:starting" });
      aiServer = await createAiServer();
      aiServerState = { status: "ready", port: aiServer.port, error: null };
      broadcastSystemEvent({ type: "ai-server:ready", port: aiServer.port });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ai-server] Failed to start:", message);
      aiServerState = { status: "error", port: null, error: message };
      broadcastSystemEvent({ type: "ai-server:error", error: message });
    }
  }

  function startProviderModelSyncOnStartup() {
    if (!backend) {
      throw new Error("Backend is not initialized.");
    }

    queueMicrotask(() => {
      if (!backend) {
        return;
      }

      void backend.services.providers.syncProvidersOnStartup().catch((error) => {
        console.error("Startup provider model sync crashed.", error);
      });
    });
  }

  function openMainWindow() {
    if (!backend) {
      throw new Error("Backend is not initialized.");
    }

    mainWindow = createMainWindow({
      trustedSenders: backend.trustedSenders,
      onClosed: () => {
        mainWindow = null;
      },
    });
  }

  // When a second instance is attempted, bring the existing window to front.
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(() => {
      try {
        backend = bootstrapBackend({
          onProviderModelsSyncCompleted: ({ providerId, status }) => {
            broadcastSystemEvent({
              type: "providers:model-sync:completed",
              providerId,
              status,
            });
          },
          onProvidersStartupModelSyncCompleted: ({
            totalProviders,
            succeededProviders,
            failedProviders,
          }) => {
            broadcastSystemEvent({
              type: "providers:start-model-sync:completed",
              totalProviders,
              succeededProviders,
              failedProviders,
            });
          },
        });
        registerIpcHandlers(backend.ipcContext);
        ipcMain.handle(SYSTEM_STATE_CHANNEL, () => getSystemState());
        openMainWindow();
        startProviderModelSyncOnStartup();
        void startAiServer();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dialog.showErrorBox("Startup failed", `The app could not initialize.\n\n${message}`);
        app.quit();
      }
    })
    .catch((error) => {
      console.error("Electron app failed before initialization.", error);
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });

  // Close the SQLite connection before the process exits so WAL is
  // checkpointed and no data is left in a partial write state.
  app.on("before-quit", () => {
    aiServer?.close();
    closeAppDatabase();
  });
}
