import {
  IPC_CHANNELS,
  type ProviderInfo,
  type ProviderCredentialTestInput,
  type ProviderCredentialTestResult,
  type ProviderModelInfo,
  type SaveProviderInput,
  type SaveProviderResult,
} from "@shared/ipc";
import { getSupportedProviderById, type ProviderId } from "@shared/providers/catalog";
import type { IpcHandlerContext } from "../core/context";
import { AppError } from "../core/errors";
import { registerInvokeHandler } from "../core/register-invoke-handler";

function expectArgCount(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw AppError.badRequest(
      `Invalid IPC argument count. Expected ${min === max ? `${min}` : `${min}-${max}`}, received ${args.length}.`,
    );
  }
}

function parseProviderId(input: unknown): ProviderId {
  if (typeof input !== "string") {
    throw AppError.badRequest("providerId must be a string.");
  }

  const provider = getSupportedProviderById(input);
  if (!provider) {
    throw AppError.badRequest(`Unsupported provider "${input}".`);
  }

  return provider.id;
}

function parseCredentialTestInput(args: unknown[]): [ProviderCredentialTestInput] {
  expectArgCount(args, 1);

  const rawInput = args[0];
  if (!rawInput || typeof rawInput !== "object") {
    throw AppError.badRequest("Credential test input must be an object.");
  }

  const providerId = parseProviderId((rawInput as { providerId?: unknown }).providerId);
  const config = (rawInput as { config?: unknown }).config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw AppError.badRequest("config must be an object.");
  }

  return [
    {
      providerId,
      config: config as Record<string, unknown>,
    },
  ];
}

function parseSaveProviderInput(args: unknown[]): [SaveProviderInput] {
  expectArgCount(args, 1);

  const rawInput = args[0];
  if (!rawInput || typeof rawInput !== "object") {
    throw AppError.badRequest("Save provider input must be an object.");
  }

  const catalogId = parseProviderId((rawInput as { catalogId?: unknown }).catalogId);
  const config = (rawInput as { config?: unknown }).config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw AppError.badRequest("config must be an object.");
  }

  const displayName = (rawInput as { displayName?: unknown }).displayName;

  return [
    {
      catalogId,
      displayName: typeof displayName === "string" ? displayName : undefined,
      config: config as Record<string, unknown>,
    },
  ];
}

function parseProviderRecordIdArg(args: unknown[]): [string] {
  expectArgCount(args, 1);

  const providerId = args[0];
  if (typeof providerId !== "string" || !providerId.trim()) {
    throw AppError.badRequest("providerId must be a non-empty string.");
  }

  return [providerId];
}

export function registerProvidersIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[], ProviderInfo[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.providers.list,
    parseArgs: (args) => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.providers.listProviders(),
  });

  registerInvokeHandler<[string], ProviderModelInfo[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.providers.listModels,
    parseArgs: parseProviderRecordIdArg,
    handler: ({ services }, _event, providerId) =>
      services.providers.listProviderModels(providerId),
  });

  registerInvokeHandler<[ProviderCredentialTestInput], ProviderCredentialTestResult>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.providers.testCredentials,
      parseArgs: parseCredentialTestInput,
      handler: ({ services }, _event, input) => services.providers.testCredentials(input),
    },
  );

  registerInvokeHandler<[SaveProviderInput], SaveProviderResult>(context, registeredChannels, {
    channel: IPC_CHANNELS.providers.save,
    parseArgs: parseSaveProviderInput,
    handler: ({ services }, _event, input) => services.providers.saveProvider(input),
  });

  registerInvokeHandler<[string], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.providers.delete,
    parseArgs: parseProviderRecordIdArg,
    handler: ({ services }, _event, providerId) => services.providers.deleteProvider(providerId),
  });
}
