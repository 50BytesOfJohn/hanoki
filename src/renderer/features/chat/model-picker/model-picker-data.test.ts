import { describe, expect, it } from "vitest";
import type { ProviderInfo, ProviderModelInfo } from "@shared/ipc";

import {
  ALL_SECTION,
  buildModelPickerSections,
  createModelSearchIndex,
  getRecentRows,
  getSectionSearchRows,
  resolveModelPickerSection,
  searchModelPickerRows,
} from "./model-picker-data";

function model(overrides: Partial<ProviderModelInfo> & { id: string }): ProviderModelInfo {
  return {
    providerId: "anthropic",
    providerModelId: overrides.id,
    displayName: null,
    isEnabled: true,
    status: "active",
    reasoningEfforts: ["none", "low", "medium", "high"],
    pinnedAt: null,
    ...overrides,
  };
}

const providers: ProviderInfo[] = [
  { id: "anthropic", displayName: "Anthropic", catalogId: "anthropic" },
  { id: "openrouter", displayName: "OpenRouter", catalogId: "openrouter" },
];

const opus = model({ id: "opus", displayName: "Claude Opus 5.5" });
const sonnet = model({ id: "sonnet", displayName: "Claude Sonnet 5.5", pinnedAt: 2 });
const haiku = model({ id: "haiku", displayName: "Claude Haiku 5.5", pinnedAt: 1 });
const gpt = model({
  id: "gpt",
  providerId: "openrouter",
  providerModelId: "openai/gpt-5.6",
  displayName: "GPT-5.6",
  reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh"],
});
const legacy = model({
  id: "legacy",
  providerId: "openrouter",
  providerModelId: "openai/gpt-4o",
  displayName: "GPT-4o",
  reasoningEfforts: [],
});

describe("buildModelPickerSections", () => {
  it("orders pinned, recent, then providers in their configured order", () => {
    const sections = buildModelPickerSections({
      models: [gpt, opus, sonnet, haiku],
      providers,
      recents: [{ modelId: "gpt", reasoningEffort: "high", usedAt: 10 }],
    });

    expect(sections.map((section) => section.id)).toEqual([
      "pinned",
      "recent",
      "provider:anthropic",
      "provider:openrouter",
    ]);
    // Oldest pin first, so pins stay where the user put them.
    expect(sections[0]?.rows.map((row) => row.model.id)).toEqual(["haiku", "sonnet"]);
    expect(sections[2]?.rows.map((row) => row.model.id)).toEqual(["haiku", "opus", "sonnet"]);
  });

  it("gives every row a unique key even when a model shows up in several sections", () => {
    const keys = buildModelPickerSections({
      models: [sonnet],
      providers,
      recents: [{ modelId: "sonnet", reasoningEffort: null, usedAt: 1 }],
    }).flatMap((section) => section.rows.map((row) => row.key));

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getRecentRows", () => {
  it("skips models that are no longer available and caps the list", () => {
    const rows = getRecentRows(
      [opus, gpt],
      [
        { modelId: "missing", reasoningEffort: null, usedAt: 4 },
        { modelId: "opus", reasoningEffort: "high", usedAt: 3 },
        { modelId: "opus", reasoningEffort: "low", usedAt: 2 },
        { modelId: "gpt", reasoningEffort: null, usedAt: 1 },
      ],
      2,
    );

    expect(rows.map((row) => [row.model.id, row.effort])).toEqual([
      ["opus", "high"],
      ["opus", "low"],
    ]);
  });

  it("collapses a level the model no longer offers into Default", () => {
    const rows = getRecentRows(
      [opus],
      [
        { modelId: "opus", reasoningEffort: "xhigh", usedAt: 2 },
        { modelId: "opus", reasoningEffort: null, usedAt: 1 },
      ],
    );

    expect(rows.map((row) => row.effort)).toEqual([null]);
  });
});

describe("searchModelPickerRows", () => {
  const models = [opus, sonnet, haiku, gpt, legacy];
  const search = (query: string) =>
    searchModelPickerRows({ index: createModelSearchIndex(models, providers), query }).map(
      (row) => row.model.id,
    );

  it("ranks name prefixes above word starts above loose matches", () => {
    const ranked = searchModelPickerRows({
      index: createModelSearchIndex(
        [
          model({ id: "inside", displayName: "Imagine" }),
          model({ id: "word", displayName: "Claude Mag" }),
          model({ id: "prefix", displayName: "Mag Large" }),
        ],
        providers,
      ),
      query: "mag",
    });

    expect(ranked.map((row) => row.model.id)).toEqual(["prefix", "word", "inside"]);
  });

  it("matches ids and provider names", () => {
    // The exact id leads; the sibling that only misses the version follows.
    expect(search("openai/gpt-4")).toEqual(["legacy", "gpt"]);
    expect(search("openrouter").sort()).toEqual(["gpt", "legacy"]);
  });

  it("ignores punctuation differences between query and name", () => {
    expect(search("gpt56")).toEqual(["gpt"]);
  });

  it("forgives typos and loose version numbers", () => {
    expect(search("sonet")).toEqual(["sonnet"]);
    expect(search("opus 5")).toEqual(["opus"]);
    expect(search("claude opsu 5.5")[0]).toBe("opus");
  });

  it("reads an effort word as the level to select", () => {
    const [row] = searchModelPickerRows({
      index: createModelSearchIndex(models, providers),
      query: "opus max",
    });

    expect(row?.model.id).toBe("opus");
    // Opus tops out at High, so Max lands on the closest level.
    expect(row?.effort).toBe("high");
  });

  it("drops models that cannot reason when an effort is asked for", () => {
    expect(search("gpt high")).toEqual(["gpt"]);
  });

  it("does not list everything for an effort word alone", () => {
    expect(search("high")).toEqual([]);
  });
});

describe("resolveModelPickerSection", () => {
  const sections = buildModelPickerSections({
    models: [opus, sonnet, gpt],
    providers,
    recents: [],
  });

  it("reopens on the remembered section", () => {
    expect(resolveModelPickerSection(sections, "provider:openrouter", "opus").id).toBe(
      "provider:openrouter",
    );
  });

  it("falls back to the section holding the model in use when the remembered one is gone", () => {
    expect(resolveModelPickerSection(sections, "provider:deleted", "gpt").id).toBe(
      "provider:openrouter",
    );
  });

  it("prefers Pinned when the model in use is pinned", () => {
    expect(resolveModelPickerSection(sections, null, "sonnet").id).toBe("pinned");
  });
});

describe("getSectionSearchRows", () => {
  const sections = buildModelPickerSections({
    models: [opus, sonnet, haiku, gpt],
    providers,
    recents: [
      { modelId: "opus", reasoningEffort: "low", usedAt: 2 },
      { modelId: "gpt", reasoningEffort: "high", usedAt: 1 },
    ],
  });
  const ranked = searchModelPickerRows({
    index: createModelSearchIndex([opus, sonnet, haiku, gpt], providers),
    query: "claude",
  });
  const section = (id: string) => sections.find((candidate) => candidate.id === id)!;

  it("keeps every match for All", () => {
    expect(getSectionSearchRows(ALL_SECTION, ranked)).toHaveLength(3);
  });

  it("narrows to one provider and drops the redundant provider label", () => {
    const rows = getSectionSearchRows(section("provider:anthropic"), ranked);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.showProvider)).toBe(true);
    expect(getSectionSearchRows(section("provider:openrouter"), ranked)).toEqual([]);
  });

  it("narrows to pinned models", () => {
    expect(
      getSectionSearchRows(section("pinned"), ranked)
        .map((row) => row.model.id)
        .sort(),
    ).toEqual(["haiku", "sonnet"]);
  });

  it("keeps recent pairs with their own effort", () => {
    const rows = getSectionSearchRows(section("recent"), ranked);

    expect(rows.map((row) => [row.model.id, row.effort])).toEqual([["opus", "low"]]);
  });
});
