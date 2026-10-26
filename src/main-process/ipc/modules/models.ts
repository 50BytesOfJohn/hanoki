import { isReasoningEffort, type ReasoningEffort } from "@shared/models/reasoning";
import {
  IPC_CHANNELS,
  type ProviderModelInfo,
  type RecentModelUsage,
  type SetProviderModelsEnabledResult,
  type UpdateModelInput,
  type UpdateModelResult,
} from "@shared/ipc";
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

function parseUpdateModelInput(args: unknown[]): [string, UpdateModelInput] {
  expectArgCount(args, 2);

  const modelId = args[0];
  if (typeof modelId !== "string" || !modelId.trim()) {
    throw AppError.badRequest("modelId must be a non-empty string.");
  }

  const rawInput = args[1];
  if (!rawInput || typeof rawInput !== "object") {
    throw AppError.badRequest("Update model input must be an object.");
  }

  const input: UpdateModelInput = {};
  const isEnabled = (rawInput as { isEnabled?: unknown }).isEnabled;
  const displayName = (rawInput as { displayName?: unknown }).displayName;
  const isPinned = (rawInput as { isPinned?: unknown }).isPinned;
  const rememberedEffort = (rawInput as { rememberedEffort?: unknown }).rememberedEffort;

  if (isEnabled !== undefined) {
    if (typeof isEnabled !== "boolean") {
      throw AppError.badRequest("isEnabled must be a boolean.");
    }
    input.isEnabled = isEnabled;
  }

  if (displayName !== undefined) {
    if (displayName !== null && typeof displayName !== "string") {
      throw AppError.badRequest("displayName must be a string or null.");
    }
    input.displayName = displayName;
  }

  if (isPinned !== undefined) {
    if (typeof isPinned !== "boolean") {
      throw AppError.badRequest("isPinned must be a boolean.");
    }
    input.isPinned = isPinned;
  }

  if (rememberedEffort !== undefined) {
    input.rememberedEffort = parseNullableReasoningEffort(rememberedEffort, "rememberedEffort");
  }

  return [modelId, input];
}

function parseNullableReasoningEffort(value: unknown, name: string): ReasoningEffort | null {
  if (value !== null && !isReasoningEffort(value)) {
    throw AppError.badRequest(`${name} must be a reasoning effort or null.`);
  }

  return value;
}

function parseRemoveRecentModelInput(args: unknown[]): [string, ReasoningEffort | null] {
  expectArgCount(args, 2);

  const modelId = args[0];
  if (typeof modelId !== "string" || !modelId.trim()) {
    throw AppError.badRequest("modelId must be a non-empty string.");
  }

  return [modelId, parseNullableReasoningEffort(args[1], "reasoningEffort")];
}

function parseSetProviderModelsEnabledInput(args: unknown[]): [string, boolean] {
  expectArgCount(args, 2);

  const providerId = args[0];
  if (typeof providerId !== "string" || !providerId.trim()) {
    throw AppError.badRequest("providerId must be a non-empty string.");
  }

  const isEnabled = args[1];
  if (typeof isEnabled !== "boolean") {
    throw AppError.badRequest("isEnabled must be a boolean.");
  }

  return [providerId, isEnabled];
}

export function registerModelsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[], ProviderModelInfo[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.models.list,
    parseArgs: (args) => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.models.listModels(),
  });

  registerInvokeHandler<[], RecentModelUsage[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.models.listRecent,
    parseArgs: (args) => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.models.listRecentModels(),
  });

  registerInvokeHandler<[string, ReasoningEffort | null], void>(context, registeredChannels, {
    channel: IPC_CHANNELS.models.removeRecent,
    parseArgs: parseRemoveRecentModelInput,
    handler: ({ services }, _event, modelId, reasoningEffort) =>
      services.models.removeRecentModel(modelId, reasoningEffort),
  });

  registerInvokeHandler<[string, UpdateModelInput], UpdateModelResult>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.models.update,
      parseArgs: parseUpdateModelInput,
      handler: ({ services }, _event, modelId, input) =>
        services.models.updateModel(modelId, input),
    },
  );

  registerInvokeHandler<[string, boolean], SetProviderModelsEnabledResult>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.models.setProviderEnabled,
      parseArgs: parseSetProviderModelsEnabledInput,
      handler: ({ services }, _event, providerId, isEnabled) =>
        services.models.setProviderModelsEnabled(providerId, isEnabled),
    },
  );
}
