import { beforeEach, describe, expect, it, vi } from "vitest";

const safeStorage = vi.hoisted(() => ({
  encryptStringAsync: vi.fn(),
  decryptStringAsync: vi.fn(),
  isAsyncEncryptionAvailable: vi.fn(),
}));

vi.mock("electron", () => ({ safeStorage }));

import { decryptString, encryptString, isEncryptionAvailable } from "./safe-storage";

describe("safe-storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("encodes encrypted bytes as base64", async () => {
    safeStorage.encryptStringAsync.mockResolvedValue(Buffer.from("v10cipher"));

    await expect(encryptString("secret")).resolves.toBe(
      Buffer.from("v10cipher").toString("base64"),
    );
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith("secret");
  });

  it("decodes base64 and returns the plaintext from the async result", async () => {
    safeStorage.decryptStringAsync.mockResolvedValue({ result: "secret", shouldReEncrypt: false });

    await expect(decryptString(Buffer.from("v10cipher").toString("base64"))).resolves.toBe(
      "secret",
    );
    expect(safeStorage.decryptStringAsync).toHaveBeenCalledWith(Buffer.from("v10cipher"));
  });

  it("reports availability from the async API", async () => {
    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);

    await expect(isEncryptionAvailable()).resolves.toBe(false);
  });
});
