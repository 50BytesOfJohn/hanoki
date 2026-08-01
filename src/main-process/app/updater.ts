import { app, autoUpdater, dialog, shell } from "electron";
import { updateElectronApp } from "update-electron-app";

import type { SystemEvent, UpdateStateSnapshot } from "@shared/events";

/**
 * Auto-updates via https://update.electronjs.org — the Electron team's free
 * update server for public GitHub repos. It reads our GitHub Releases and hands
 * Squirrel.Mac the matching `.zip` asset, so the only thing the release pipeline
 * owes it is a signed, notarized zip named `*-mac*-arm64-*.zip` (see forge.config.ts).
 *
 * Downloads happen in the background; the renderer drives the "restart now"
 * decision off the state broadcast below.
 */

const RELEASES_URL = "https://github.com/50BytesOfJohn/hanoki/releases";
// GitHub Releases move at human speed, so hourly is plenty and keeps us far
// below the shared update service's rate limits.
const UPDATE_INTERVAL = "1 hour";

let broadcast: ((event: SystemEvent) => void) | null = null;
let stopPeriodicChecks: (() => void) | null = null;

let state: UpdateStateSnapshot = {
  status: "unsupported",
  currentVersion: app.getVersion(),
  readyVersion: null,
  releaseNotes: null,
  error: null,
  checkedManually: false,
};

export function getUpdateState(): UpdateStateSnapshot {
  return state;
}

function setState(patch: Partial<UpdateStateSnapshot>): void {
  state = { ...state, ...patch };
  broadcast?.({ type: "update:state", update: state });
}

/**
 * Squirrel only ships for macOS and Windows, and an unpackaged app has no
 * bundle to swap out. Hanoki targets macOS, so everything else stays
 * `unsupported` and the UI points at the releases page instead.
 */
function isUpdaterSupported(): boolean {
  return app.isPackaged && process.platform === "darwin";
}

export function initUpdater(deps: { broadcast: (event: SystemEvent) => void }): void {
  broadcast = deps.broadcast;

  if (!isUpdaterSupported()) {
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    setState({ status: "checking", error: null });
  });

  autoUpdater.on("update-available", () => {
    setState({ status: "downloading", error: null });
  });

  autoUpdater.on("update-not-available", () => {
    const wasManual = state.checkedManually;
    setState({ status: "idle", checkedManually: false });
    if (wasManual) {
      void dialog.showMessageBox({
        type: "info",
        message: "You're up to date",
        detail: `Hanoki ${state.currentVersion} is the latest version.`,
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName) => {
    // Nothing left to poll for, and re-checking after a download makes Squirrel
    // stage the same release again.
    stopPeriodicChecks?.();
    setState({
      status: "ready",
      readyVersion: releaseName || null,
      releaseNotes: releaseNotes || null,
      error: null,
      checkedManually: false,
    });
  });

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[updater]", message);
    const wasManual = state.checkedManually;
    setState({ status: "error", error: message, checkedManually: false });
    if (wasManual) {
      void dialog.showMessageBox({
        type: "error",
        message: "Could not check for updates",
        detail: message,
        buttons: ["OK"],
      });
    }
  });

  const { stopUpdates } = updateElectronApp({
    updateInterval: UPDATE_INTERVAL,
    // The renderer owns the prompt, so the module's native dialog stays off.
    notifyUser: false,
  });
  stopPeriodicChecks = stopUpdates;

  setState({ status: "idle" });
}

/**
 * User-initiated check, from the app menu or settings. Returns the state as of
 * the request — the outcome arrives later over the event bus.
 */
export function checkForUpdates(): UpdateStateSnapshot {
  if (state.status === "unsupported" || state.status === "checking") {
    return state;
  }

  if (state.status === "downloading") {
    return state;
  }

  // Already staged — there is nothing left to check, so offer the restart the
  // user is really asking for.
  if (state.status === "ready") {
    void dialog
      .showMessageBox({
        type: "info",
        message: `Hanoki ${state.readyVersion ?? ""} is ready to install`.trim(),
        detail: "Restart the app to finish updating.",
        buttons: ["Restart", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          installUpdate();
        }
      });
    return state;
  }

  setState({ checkedManually: true });

  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState({ status: "error", error: message, checkedManually: false });
  }

  return state;
}

export function installUpdate(): void {
  if (state.status !== "ready") {
    return;
  }

  autoUpdater.quitAndInstall();
}

export function openReleasesPage(): Promise<void> {
  return shell.openExternal(RELEASES_URL);
}
