import { safeStorage } from "electron";

export function encryptString(plaintext: string): string {
  const encrypted = safeStorage.encryptString(plaintext);
  return encrypted.toString("base64");
}

export function decryptString(base64Ciphertext: string): string {
  const buffer = Buffer.from(base64Ciphertext, "base64");
  return safeStorage.decryptString(buffer);
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
