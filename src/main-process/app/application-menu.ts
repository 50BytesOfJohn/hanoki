import { Menu, type MenuItemConstructorOptions } from "electron";

import { getConfig } from "../config";
import type { AppServices } from "../services";
import { checkForUpdates } from "./updater";
import type { SystemEvent } from "@shared/events";

/**
 * The application menu. Electron has no way to extend its built-in default, so
 * owning one custom item means owning the whole template — standard behaviour is
 * kept by leaning on roles rather than hand-rolling the usual submenus.
 */

const ACTIVITY_PANEL_ITEM_ID = "view.activityPanel";
const isMac = process.platform === "darwin";

interface ApplicationMenuDeps {
  services: AppServices;
  broadcast: (event: SystemEvent) => void;
}

let deps: ApplicationMenuDeps | null = null;

export function installApplicationMenu(next: ApplicationMenuDeps): void {
  deps = next;
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()));
}

/**
 * Mirrors the current config onto the menu. Call it whenever a mirrored setting
 * changes somewhere other than the menu itself — the renderer settings page and
 * the activity panel's own "Hide panel" both land here via the settings IPC module.
 */
export function syncApplicationMenu(): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(ACTIVITY_PANEL_ITEM_ID);
  if (item) {
    item.checked = getConfig().chat.activityPanel.enabled;
  }
}

/**
 * Electron's `appMenu` role, expanded by hand so "Check for Updates…" can sit
 * in its customary spot right under "About". Everything else is the role's own
 * default layout.
 */
function buildAppMenu(): MenuItemConstructorOptions {
  return {
    role: "appMenu",
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Check for Updates…",
        click: () => {
          checkForUpdates();
        },
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
}

function buildTemplate(): MenuItemConstructorOptions[] {
  return [
    ...(isMac ? ([buildAppMenu()] satisfies MenuItemConstructorOptions[]) : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      // Electron's `viewMenu` role, plus Hanoki's own toggles below the fold.
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          id: ACTIVITY_PANEL_ITEM_ID,
          label: "Show Activity Panel",
          type: "checkbox",
          checked: getConfig().chat.activityPanel.enabled,
          // A checkbox item flips `checked` itself before `click` runs.
          click: (item) => setActivityPanelEnabled(item.checked),
        },
      ],
    },
    { role: "windowMenu" },
  ];
}

function setActivityPanelEnabled(enabled: boolean): void {
  if (!deps) return;

  try {
    const settings = deps.services.settings.updateGlobalChatSettings({
      activityPanelEnabled: enabled,
    });
    deps.broadcast({ type: "settings:global-chat-updated", settings });
  } catch (error) {
    console.error("[menu] Failed to toggle the activity panel:", error);
  }

  // Reconcile the checkmark with what the config actually holds, in case the write failed.
  syncApplicationMenu();
}
