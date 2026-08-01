import { describe, expect, it } from "vitest";

import { MAC_ARM64_PATTERN, MAC_ASSET_PATTERN, macArtifactName } from "./mac-artifact-name";

describe("macArtifactName", () => {
  it("produces a zip update.electronjs.org routes to darwin-arm64", () => {
    const name = macArtifactName("arm64", "0.0.23", ".zip");

    expect(name).toBe("hanoki-macos-arm64-0.0.23.zip");
    expect(MAC_ASSET_PATTERN.test(name)).toBe(true);
    expect(MAC_ARM64_PATTERN.test(name)).toBe(true);
  });

  it("does not claim arm64 for an x64 build", () => {
    const name = macArtifactName("x64", "0.0.23", ".zip");

    expect(MAC_ASSET_PATTERN.test(name)).toBe(true);
    expect(MAC_ARM64_PATTERN.test(name)).toBe(false);
  });

  it("leaves the dmg out of the updater's asset matching", () => {
    // The dmg is the download-and-drag path; Squirrel must never be handed one.
    expect(MAC_ASSET_PATTERN.test(macArtifactName("arm64", "0.0.23", ".dmg"))).toBe(false);
  });
});
