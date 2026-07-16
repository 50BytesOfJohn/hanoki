import { join } from "node:path";

import { getUserDataDirectory } from "../system/paths";
import { ConfigStore } from "./store";
import type { AppConfig } from "./types";

export type { AppConfig, DeepPartial } from "./types";

const CONFIG_FILENAME = "config.toml";

function resolveConfigPath(): string {
  if (process.env["HANOKI_CONFIG_PATH"]) {
    return process.env["HANOKI_CONFIG_PATH"];
  }
  return join(getUserDataDirectory(), CONFIG_FILENAME);
}

// Singleton — created once at module load time.
let configStore: ConfigStore | null = null;

function getStore(): ConfigStore {
  if (!configStore) {
    configStore = new ConfigStore(resolveConfigPath());
  }
  return configStore;
}

/** Returns the current in-memory config (merged with defaults). */
export function getConfig(): AppConfig {
  return getStore().get();
}

/** Deep-merges `patch` into the current config and persists to disk. */
export function updateConfig(patch: Parameters<ConfigStore["update"]>[0]): void {
  getStore().update(patch);
}

/**
 * Re-reads config.toml from disk and refreshes the in-memory state.
 * Call this after an external change (e.g. user edited the file manually).
 */
export function reloadConfig(): void {
  getStore().reload();
}

/** Absolute path to the config file (useful for display / opening in editor). */
export function getConfigPath(): string {
  return resolveConfigPath();
}
