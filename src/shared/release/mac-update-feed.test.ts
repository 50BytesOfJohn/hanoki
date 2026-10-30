import { describe, expect, it } from "vitest";

import { MAC_ASSET_PATTERN } from "./mac-artifact-name";
import { buildMacUpdateFeed, macDeltaName } from "./mac-update-feed";

const zip = { name: "hanoki-macos-arm64-0.0.39.zip", sha256: "a".repeat(64), size: 100 };
const base = {
  repository: "50BytesOfJohn/hanoki",
  version: "0.0.39",
  tag: "v0.0.39",
  pubDate: "2026-10-30T10:00:00.000Z",
  notes: "Notes",
  zip,
};

describe("buildMacUpdateFeed", () => {
  it("points the current release at a verifiable zip on the tagged release", () => {
    const feed = buildMacUpdateFeed(base);

    expect(feed.currentRelease).toBe("0.0.39");
    expect(feed.releases).toHaveLength(1);
    expect(feed.releases[0].version).toBe(feed.currentRelease);
    expect(feed.releases[0].updateTo).toMatchObject({
      url: "https://github.com/50BytesOfJohn/hanoki/releases/download/v0.0.39/hanoki-macos-arm64-0.0.39.zip",
      sha256: zip.sha256,
      size: 100,
    });
    expect(feed.releases[0].updateTo).not.toHaveProperty("delta");
  });

  it("declares all four keys Squirrel requires of a delta", () => {
    const name = macDeltaName("arm64", "0.0.38", "0.0.39");
    const feed = buildMacUpdateFeed({
      ...base,
      delta: { name, fromVersion: "0.0.38", sha256: "b".repeat(64), size: 10 },
    });

    expect(feed.releases[0].updateTo.delta).toEqual({
      from_version: "0.0.38",
      url: `https://github.com/50BytesOfJohn/hanoki/releases/download/v0.0.39/${name}`,
      sha256: "b".repeat(64),
      size: 10,
    });
  });
});

describe("macDeltaName", () => {
  it("stays out of update.electronjs.org's asset matching", () => {
    expect(MAC_ASSET_PATTERN.test(macDeltaName("arm64", "0.0.38", "0.0.39"))).toBe(false);
  });
});
