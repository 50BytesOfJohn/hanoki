import { describe, expect, it } from "vitest";

import { fuzzySearch } from "./fuzzy-search";

const models = [
  { name: "DeepSeek V4 Pro", id: "deepseek/deepseek-v4-pro" },
  { name: "DeepSeek V4 Flash", id: "deepseek/deepseek-v4-flash" },
  { name: "DeepSeek V3.1", id: "deepseek/deepseek-v3.1" },
  { name: "Claude Sonnet 4.5", id: "anthropic/claude-sonnet-4-5" },
  { name: "Claude Opus 4.1", id: "anthropic/claude-opus-4.1" },
  { name: "GPT-4o", id: "openai/gpt-4o" },
  { name: "Gemini 2.5 Pro", id: "google/gemini-2.5-pro" },
];

const search = (query: string) =>
  fuzzySearch(models, query, (model) => [
    { text: model.name },
    { text: model.id, weight: 0.9 },
  ]).map((model) => model.name);

describe("fuzzySearch", () => {
  it("finds a version written without its letter prefix", () => {
    expect(search("deepseek 4").slice(0, 2)).toEqual(["DeepSeek V4 Pro", "DeepSeek V4 Flash"]);
  });

  it("lists close matches after the complete ones", () => {
    expect(search("deepseek 4")).toEqual(["DeepSeek V4 Pro", "DeepSeek V4 Flash", "DeepSeek V3.1"]);
  });

  it("does not let a lone number pull in unrelated models", () => {
    expect(search("deepseek 4")).not.toContain("GPT-4o");
  });

  it("forgives typos", () => {
    expect(search("sonet")).toEqual(["Claude Sonnet 4.5"]);
    expect(search("gemni pro")).toEqual(["Gemini 2.5 Pro"]);
    expect(search("deepsek v4")[0]).toBe("DeepSeek V4 Pro");
  });

  it("ranks exact words above typo matches", () => {
    const items = [{ name: "Opal" }, { name: "Opus" }];
    expect(fuzzySearch(items, "opus", (item) => [{ text: item.name }]).map((i) => i.name)).toEqual([
      "Opus",
    ]);
    expect(fuzzySearch(items, "opu", (item) => [{ text: item.name }]).map((i) => i.name)).toEqual([
      "Opus",
    ]);
  });

  it("ignores punctuation between query and name", () => {
    expect(search("gpt4o")).toEqual(["GPT-4o"]);
    expect(search("sonnet 45")).toEqual(["Claude Sonnet 4.5"]);
  });

  it("keeps a dotted version together", () => {
    expect(search("opus 4.1")[0]).toBe("Claude Opus 4.1");
    expect(search("claude 4.5")[0]).toBe("Claude Sonnet 4.5");
  });

  it("returns everything for an empty query", () => {
    expect(search("  ")).toHaveLength(models.length);
  });

  it("returns nothing when nothing is close", () => {
    expect(search("llama")).toEqual([]);
  });
});
