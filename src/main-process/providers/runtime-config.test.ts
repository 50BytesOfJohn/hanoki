import { getSupportedProviderById } from "@shared/providers/catalog";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decryptString = vi.hoisted(() => vi.fn());

vi.mock("../services/safe-storage", () => ({ decryptString }));

import { parseStoredProviderConfig } from "./runtime-config";

const provider = getSupportedProviderById("openrouter")!;

describe("parseStoredProviderConfig", () => {
  beforeEach(() => {
    decryptString.mockReset();
  });

  it("resolves secret fields to their decrypted value", async () => {
    decryptString.mockResolvedValue("sk-plain");

    await expect(
      parseStoredProviderConfig(provider, { apiKey: { $secret: "cipher" } }),
    ).resolves.toEqual({ apiKey: "sk-plain" });
    expect(decryptString).toHaveBeenCalledWith("cipher");
  });

  it("names the field when decryption rejects", async () => {
    decryptString.mockRejectedValue(new Error("keychain unavailable"));

    await expect(
      parseStoredProviderConfig(provider, { apiKey: { $secret: "cipher" } }),
    ).rejects.toThrow('Failed to decrypt stored config field "apiKey".');
  });
});
