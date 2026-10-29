import { describe, expect, it } from "vitest";
import { normalizeOpenAiCompatibleBaseUrl } from "./openai-compatible-base-url";

describe("normalizeOpenAiCompatibleBaseUrl", () => {
  it("keeps the path and drops trailing slashes", () => {
    expect(normalizeOpenAiCompatibleBaseUrl(" https://api.example.com/v1/ ")).toBe(
      "https://api.example.com/v1",
    );
  });

  it("keeps a custom port", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("http://localhost:1234/v1")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("strips query and hash", () => {
    expect(normalizeOpenAiCompatibleBaseUrl("https://api.example.com/v1?x=1#y")).toBe(
      "https://api.example.com/v1",
    );
  });

  it("rejects values that are not http(s) URLs", () => {
    expect(() => normalizeOpenAiCompatibleBaseUrl("api.example.com/v1")).toThrow(
      /Invalid base URL/,
    );
    expect(() => normalizeOpenAiCompatibleBaseUrl("ftp://api.example.com")).toThrow(/protocol/);
    expect(() => normalizeOpenAiCompatibleBaseUrl("  ")).toThrow(/required/);
  });
});
