import {
  getSupportedProviderById,
  type ProviderHostPortConfigValue,
  type SupportedProviderDefinition,
} from "@shared/providers/catalog";
import { decryptString } from "../services/safe-storage";
import type { ProviderTableRow } from "./repository";

export type ParsedProviderRuntimeConfigValue = string | ProviderHostPortConfigValue;
export type ParsedProviderRuntimeConfig = Record<string, ParsedProviderRuntimeConfigValue>;

export interface ResolvedProviderRuntimeContext {
  providerDef: SupportedProviderDefinition;
  parsedConfig: ParsedProviderRuntimeConfig;
}

interface StoredSecretConfigValue {
  $secret: string;
}

interface StoredHostPortConfigValue {
  host: unknown;
  port: unknown;
}

export function resolveProviderRuntimeContext(
  providerRow: ProviderTableRow,
): ResolvedProviderRuntimeContext {
  const providerDef = getSupportedProviderById(providerRow.catalogId);
  if (!providerDef || !providerDef.isAvailable) {
    throw new Error(`Provider "${providerRow.catalogId}" is not available.`);
  }

  return {
    providerDef,
    parsedConfig: parseStoredProviderConfig(providerDef, providerRow.config),
  };
}

export function parseStoredProviderConfig(
  providerDef: SupportedProviderDefinition,
  storedConfig: unknown,
): ParsedProviderRuntimeConfig {
  const parsedConfig = parseStoredConfigObject(providerDef.id, storedConfig);
  const allowedKeys = new Set(Object.keys(providerDef.configFields));

  for (const key of Object.keys(parsedConfig)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported stored config field "${key}" for provider "${providerDef.id}".`);
    }
  }

  const runtimeConfig: ParsedProviderRuntimeConfig = {};

  for (const [key, field] of Object.entries(providerDef.configFields)) {
    switch (field.type) {
      case "secret": {
        const rawValue = parsedConfig[key];

        if (rawValue == null) {
          if (field.required) {
            throw new Error(`Missing required stored config field "${key}".`);
          }
          continue;
        }

        if (!isStoredSecretConfigValue(rawValue)) {
          throw new Error(`Stored secret field "${key}" has invalid format.`);
        }

        let decrypted: string;
        try {
          decrypted = decryptString(rawValue.$secret);
        } catch (error) {
          throw new Error(`Failed to decrypt stored config field "${key}".`, { cause: error });
        }

        if (!decrypted && field.required) {
          throw new Error(`Stored config field "${key}" is empty after decryption.`);
        }

        runtimeConfig[key] = decrypted;
        break;
      }
      case "host+port": {
        const rawValue = parsedConfig[key];

        if (rawValue == null) {
          if (field.required) {
            throw new Error(`Missing required stored config field "${key}".`);
          }
          continue;
        }

        runtimeConfig[key] = parseStoredHostPortConfigValue(rawValue, key);
        break;
      }
    }
  }

  return runtimeConfig;
}

function parseStoredHostPortConfigValue(value: unknown, key: string): ProviderHostPortConfigValue {
  if (!isStoredHostPortConfigValue(value)) {
    throw new Error(`Stored host+port field "${key}" has invalid format.`);
  }

  const host = readTrimmedString(value.host);
  if (!host) {
    throw new Error(`Stored host+port field "${key}" is missing host.`);
  }

  const port = parsePortNumber(value.port);
  if (port === null) {
    throw new Error(`Stored host+port field "${key}" has invalid port.`);
  }

  return { host, port };
}

function parseStoredConfigObject(providerId: string, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Stored config for provider "${providerId}" must be an object.`);
  }

  return raw as Record<string, unknown>;
}

function isStoredSecretConfigValue(value: unknown): value is StoredSecretConfigValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const secret = (value as { $secret?: unknown }).$secret;
  return typeof secret === "string" && secret.length > 0;
}

function isStoredHostPortConfigValue(value: unknown): value is StoredHostPortConfigValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePortNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return null;
  }

  return parsed;
}
