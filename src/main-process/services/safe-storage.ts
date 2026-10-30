import { safeStorage } from "electron";

export async function encryptString(plaintext: string): Promise<string> {
  const encrypted = await safeStorage.encryptStringAsync(plaintext);
  return encrypted.toString("base64");
}

export async function decryptString(base64Ciphertext: string): Promise<string> {
  const buffer = Buffer.from(base64Ciphertext, "base64");
  const { result } = await safeStorage.decryptStringAsync(buffer);
  return result;
}

export function isEncryptionAvailable(): Promise<boolean> {
  return safeStorage.isAsyncEncryptionAvailable();
}
