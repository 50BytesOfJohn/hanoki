import { app, autoUpdater, dialog, shell } from "electron";
import { UpdateSourceType, updateElectronApp } from "update-electron-app";

import type { SystemEvent, UpdateStateSnapshot } from "@shared/events";

/**
 * Auto-updates from a static feed on our GitHub Releases: the Release workflow
 * attaches a `RELEASES.json` to each release (see scripts/publish-mac-update-feed.mts),
 * and `releases/latest/download` always resolves to the newest published,
 * non-prerelease one.
 *
 * Squirrel.Mac does the rest. It applies a binary delta when the feed offers one
 * from the running version, falls back to the `.zip` otherwise, and resumes an
 * interrupted download on the next check because GitHub's CDN honours `Range`.
 *
 * Downloads happen in the background; the renderer drives the "restart now"
 * decision off the state broadcast below.
 */

const RELEASES_URL = "https://github.com/50BytesOfJohn/hanoki/releases";
const UPDATE_FEED_BASE_URL = `${RELEASES_URL}/latest/download`;
// GitHub Releases move at human speed, so hourly is plenty.
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
 * bundle to swap out. Hanoki targets arm64 macOS and the feed only describes
 * that build, so everything else stays `unsupported` and the UI points at the
 * releases page instead.
 */
function isUpdaterSupported(): boolean {
  return app.isPackaged && process.platform === "darwin" && process.arch === "arm64";
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
    updateSource: { type: UpdateSourceType.StaticStorage, baseUrl: UPDATE_FEED_BASE_URL },
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
