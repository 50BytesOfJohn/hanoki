import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closeAppDatabase, getAppDatabase, initializeAppDatabase } from "../db/database";
import { modelUsage, models, providers } from "../db/schema";
import {
  deleteModelUsage,
  getLatestUsableModelUsage,
  listModelUsage,
  recordModelUsage,
  updateModel,
} from "./repository";

const testDataDirectory = mkdtempSync(join(tmpdir(), "hanoki-model-usage-"));

beforeAll(() => {
  process.env["HANOKI_USER_DATA_DIR"] = testDataDirectory;
  initializeAppDatabase();
  getAppDatabase()
    .insert(providers)
    .values({ id: "provider", displayName: "Provider", catalogId: "anthropic" })
    .run();
  for (const id of ["opus", "sonnet", "haiku"]) {
    getAppDatabase()
      .insert(models)
      .values({ id, providerId: "provider", providerModelId: id, canonicalModelId: id })
      .run();
  }
});

beforeEach(() => {
  getAppDatabase().delete(modelUsage).run();
  getAppDatabase().update(models).set({ isEnabled: true }).run();
  vi.useRealTimers();
});

afterAll(() => {
  closeAppDatabase();
  rmSync(testDataDirectory, { recursive: true, force: true });
});

function recordAt(time: number, modelId: string, effort: string) {
  vi.useFakeTimers({ now: time, toFake: ["Date"] });
  recordModelUsage(modelId, effort);
  vi.useRealTimers();
}

describe("model usage", () => {
  it("keeps one row per model + effort pair and moves it to the front when reused", () => {
    recordAt(1, "opus", "high");
    recordAt(2, "opus", "");
    recordAt(3, "opus", "high");

    expect(listModelUsage(10).map((row) => [row.modelId, row.reasoningEffort])).toEqual([
      ["opus", "high"],
      ["opus", ""],
    ]);
  });

  it("prunes the oldest pairs past the cap", () => {
    for (let index = 0; index < 55; index += 1) {
      recordAt(index + 1, "sonnet", `effort-${index}`);
    }

    const rows = listModelUsage(100);
    expect(rows).toHaveLength(50);
    expect(rows.at(-1)?.reasoningEffort).toBe("effort-5");
  });

  it("forgets a single pair", () => {
    recordAt(1, "opus", "high");
    recordAt(2, "opus", "low");
    deleteModelUsage("opus", "low");

    expect(listModelUsage(10).map((row) => row.reasoningEffort)).toEqual(["high"]);
  });

  it("seeds from the newest pair whose model is still enabled", () => {
    recordAt(1, "haiku", "low");
    recordAt(2, "opus", "high");
    updateModel("opus", { isEnabled: false });

    expect(getLatestUsableModelUsage()).toMatchObject({ modelId: "haiku", reasoningEffort: "low" });
  });
});

describe("updateModel", () => {
  it("stores pin and remembered effort alongside the existing fields", () => {
    const updated = updateModel("sonnet", { pinnedAt: 42, reasoningEffort: "medium" });

    expect(updated).toMatchObject({ pinnedAt: 42, reasoningEffort: "medium", isEnabled: true });
    expect(updateModel("sonnet", { pinnedAt: null })?.pinnedAt).toBeNull();
  });
});
