import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Rectangle,
  screen,
} from "electron";

import { getConfig, updateConfig } from "../config";
import type { PersistedWindowState } from "../config/types";

type WindowStateWindowId = "main" | (string & {});

type WindowPositionAndSize = Pick<BrowserWindowConstructorOptions, "width" | "height" | "x" | "y">;

export interface CreatePersistentWindowStateOptions {
  windowId: WindowStateWindowId;
  defaultSize: {
    width: number;
    height: number;
  };
}

export interface PersistentWindowStateController {
  browserWindowOptions: WindowPositionAndSize;
  attach(window: BrowserWindow): void;
}

interface ResolvedWindowState {
  bounds: Pick<Rectangle, "width" | "height"> & Partial<Pick<Rectangle, "x" | "y">>;
  isMaximized: boolean;
}

function rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidWindowBounds(bounds: Partial<Rectangle>): bounds is Rectangle {
  return (
    typeof bounds.x === "number" &&
    Number.isFinite(bounds.x) &&
    typeof bounds.y === "number" &&
    Number.isFinite(bounds.y) &&
    isFinitePositiveNumber(bounds.width) &&
    isFinitePositiveNumber(bounds.height)
  );
}

function isOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => rectanglesIntersect(bounds, display.workArea));
}

function getSavedWindowState(windowId: string): PersistedWindowState | undefined {
  return getConfig().window?.[windowId];
}

function resolveWindowState(
  saved: PersistedWindowState | undefined,
  defaultSize: CreatePersistentWindowStateOptions["defaultSize"],
): ResolvedWindowState {
  const width = isFinitePositiveNumber(saved?.width) ? saved.width : defaultSize.width;
  const height = isFinitePositiveNumber(saved?.height) ? saved.height : defaultSize.height;

  const candidateBounds: Partial<Rectangle> = {
    x: saved?.x,
    y: saved?.y,
    width,
    height,
  };

  if (isValidWindowBounds(candidateBounds) && isOnAnyDisplay(candidateBounds)) {
    return {
      bounds: candidateBounds,
      isMaximized: saved?.isMaximized === true,
    };
  }

  return {
    bounds: { width, height },
    isMaximized: saved?.isMaximized === true,
  };
}

function persistWindowState(windowId: string, window: BrowserWindow): void {
  const bounds = window.getNormalBounds();

  updateConfig({
    window: {
      [windowId]: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: window.isMaximized(),
      },
    },
  });
}

export function createPersistentWindowState(
  options: CreatePersistentWindowStateOptions,
): PersistentWindowStateController {
  const initialState = resolveWindowState(
    getSavedWindowState(options.windowId),
    options.defaultSize,
  );

  return {
    browserWindowOptions: {
      width: initialState.bounds.width,
      height: initialState.bounds.height,
      ...(initialState.bounds.x !== undefined && initialState.bounds.y !== undefined
        ? {
            x: initialState.bounds.x,
            y: initialState.bounds.y,
          }
        : {}),
    },
    attach(window) {
      window.on("close", () => {
        persistWindowState(options.windowId, window);
      });

      if (initialState.isMaximized) {
        window.maximize();
      }
    },
  };
}
