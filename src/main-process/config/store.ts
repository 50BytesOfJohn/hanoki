import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { parse, stringify } from "smol-toml";

import { DEFAULT_CONFIG } from "./defaults";
import type { AppConfig, DeepPartial } from "./types";

function deepMerge<T extends object>(base: T, override: DeepPartial<T>): T {
  const result = { ...base } as T;

  for (const key of Object.keys(override) as (keyof T)[]) {
    const overrideVal = override[key as keyof DeepPartial<T>];
    const baseVal = base[key];

    if (
      overrideVal !== undefined &&
      overrideVal !== null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as object, overrideVal as DeepPartial<object>) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }

  return result;
}

export class ConfigStore {
  private configPath: string;
  private current: AppConfig;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.current = this.load();
  }

  private load(): AppConfig {
    if (!existsSync(this.configPath)) {
      return structuredClone(DEFAULT_CONFIG);
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const parsed = parse(raw) as DeepPartial<AppConfig>;
      return deepMerge(DEFAULT_CONFIG, parsed);
    } catch (err) {
      console.warn(`[config] Failed to parse ${this.configPath}, using defaults:`, err);
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  get(): AppConfig {
    return this.current;
  }

  update(patch: DeepPartial<AppConfig>): void {
    this.current = deepMerge(this.current, patch);
    this.persist();
  }

  reload(): void {
    this.current = this.load();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.configPath), { recursive: true });
      writeFileSync(
        this.configPath,
        stringify(this.current as unknown as Record<string, unknown>),
        "utf8",
      );
    } catch (err) {
      console.error(`[config] Failed to write ${this.configPath}:`, err);
    }
  }
}
