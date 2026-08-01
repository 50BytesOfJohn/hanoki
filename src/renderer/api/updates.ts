import "../lib/electron-api";

export const updatesApi = {
  check() {
    return window.electronAPI.checkForUpdates();
  },
  install() {
    return window.electronAPI.installUpdate();
  },
  openReleases() {
    return window.electronAPI.openReleasesPage();
  },
};
