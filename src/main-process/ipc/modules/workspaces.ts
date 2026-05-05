import {
  type ActiveWorkspaceInfo,
  type GetActiveWorkspaceOptions,
  IPC_CHANNELS,
  type TabStateItem,
  type TabsUiState,
  type WorkspaceInfo,
  type WorkspaceSettings,
  type WorkspaceSettingsPatch,
  type WorkspaceUpdateInput,
} from "@shared/ipc";
import { parseChatId } from "@shared/chat/chat-id";
import { parseWorkspaceColor } from "@shared/workspace/workspace-color";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";
import { parseWorkspaceName } from "@shared/workspace/workspace-name";
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

function parseValidWorkspaceId(input: unknown): string {
  const parsedId = parseWorkspaceId(input);
  if (!parsedId.ok) {
    throw AppError.badRequest(parsedId.error);
  }

  return parsedId.value;
}

function parseValidWorkspaceName(input: unknown): string {
  const parsedName = parseWorkspaceName(input);
  if (!parsedName.ok) {
    throw AppError.badRequest(parsedName.error);
  }

  return parsedName.value;
}

function parseValidWorkspaceColor(input: unknown): string {
  const parsedColor = parseWorkspaceColor(input);
  if (!parsedColor.ok) {
    throw AppError.badRequest(parsedColor.error);
  }

  return parsedColor.value;
}

function parseWorkspaceUpdateInput(args: unknown[]): [string, WorkspaceUpdateInput] {
  expectArgCount(args, 2);

  const workspaceId = parseValidWorkspaceId(args[0]);
  const rawInput = args[1];

  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw AppError.badRequest("Workspace update payload must be an object.");
  }

  const inputRecord = rawInput as Record<string, unknown>;
  const allowedKeys = new Set(["name", "color"]);
  for (const key of Object.keys(inputRecord)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported workspace update field "${key}".`);
    }
  }

  const parsedInput: WorkspaceUpdateInput = {};

  if (inputRecord.name !== undefined) {
    parsedInput.name = parseValidWorkspaceName(inputRecord.name);
  }

  if (inputRecord.color !== undefined) {
    parsedInput.color = parseValidWorkspaceColor(inputRecord.color);
  }

  return [workspaceId, parsedInput];
}

function parseWorkspaceSettingsUpdateInput(args: unknown[]): [string, WorkspaceSettingsPatch] {
  expectArgCount(args, 2);

  const workspaceId = parseValidWorkspaceId(args[0]);
  const rawPatch = args[1];
  if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) {
    throw AppError.badRequest("Workspace settings patch must be an object.");
  }

  return [workspaceId, rawPatch as WorkspaceSettingsPatch];
}

function parseValidTabId(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw AppError.badRequest("tab.id must be a non-empty string.");
  }

  return input;
}

function parseValidChatId(input: unknown): string {
  const parsedId = parseChatId(input);
  if (!parsedId.ok) {
    throw AppError.badRequest(parsedId.error);
  }

  return parsedId.value;
}

function parseValidTabType(input: unknown): "chat" {
  if (input !== "chat") {
    throw AppError.badRequest('tab.type must be "chat".');
  }

  return "chat";
}

function parseTabsArray(input: unknown): TabStateItem[] {
  if (!Array.isArray(input)) {
    throw AppError.badRequest("Tabs must be an array.");
  }

  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw AppError.badRequest(`Tab at index ${index} must be an object.`);
    }

    const record = entry as Record<string, unknown>;
    const allowedKeys = new Set(["id", "type", "chatId"]);
    for (const key of Object.keys(record)) {
      if (!allowedKeys.has(key)) {
        throw AppError.badRequest(`Unsupported tab field "${key}".`);
      }
    }

    return {
      id: parseValidTabId(record.id),
      type: parseValidTabType(record.type),
      chatId: parseValidChatId(record.chatId),
    };
  });
}

function parseGetActiveWorkspaceInput(args: unknown[]): [GetActiveWorkspaceOptions] {
  expectArgCount(args, 0, 1);

  if (args.length === 0 || args[0] === undefined) {
    return [{}];
  }

  if (typeof args[0] !== "object" || args[0] === null || Array.isArray(args[0])) {
    throw AppError.badRequest("getActive options must be an object when provided.");
  }

  const options = args[0] as Record<string, unknown>;
  const allowedKeys = new Set(["includeSettings"]);
  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) {
      throw AppError.badRequest(`Unsupported getActive option field "${key}".`);
    }
  }

  if (options.includeSettings !== undefined && typeof options.includeSettings !== "boolean") {
    throw AppError.badRequest("includeSettings must be a boolean when provided.");
  }

  return [{ includeSettings: options.includeSettings as boolean | undefined }];
}

export function registerWorkspaceIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[], WorkspaceInfo[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.workspaces.list,
    parseArgs: (args) => {
      expectArgCount(args, 0);
      return [];
    },
    handler: ({ services }) => services.workspaces.listWorkspaces(),
  });

  registerInvokeHandler<[GetActiveWorkspaceOptions], ActiveWorkspaceInfo>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.workspaces.getActive,
      parseArgs: parseGetActiveWorkspaceInput,
      handler: ({ services }, _event, options) => services.workspaces.getActiveWorkspace(options),
    },
  );

  registerInvokeHandler<[string], WorkspaceInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.workspaces.create,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidWorkspaceName(args[0])];
    },
    handler: ({ services }, _event, name) => services.workspaces.createWorkspace(name),
  });

  registerInvokeHandler<[string], ActiveWorkspaceInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.workspaces.setActive,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidWorkspaceId(args[0])];
    },
    handler: ({ services }, _event, id) => services.workspaces.setActiveWorkspace(id),
  });

  registerInvokeHandler<[string, WorkspaceUpdateInput], WorkspaceInfo>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.workspaces.update,
      parseArgs: parseWorkspaceUpdateInput,
      handler: ({ services }, _event, id, input) => services.workspaces.updateWorkspace(id, input),
    },
  );

  registerInvokeHandler<[string, WorkspaceSettingsPatch], WorkspaceSettings>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.workspaces.updateSettings,
      parseArgs: parseWorkspaceSettingsUpdateInput,
      handler: ({ services }, _event, id, settingsPatch) =>
        services.workspaces.updateWorkspaceSettings(id, settingsPatch),
    },
  );

  registerInvokeHandler<[string], TabsUiState>(context, registeredChannels, {
    channel: IPC_CHANNELS.workspaces.getTabsUiState,
    parseArgs: (args) => {
      expectArgCount(args, 1);
      return [parseValidWorkspaceId(args[0])];
    },
    handler: ({ services }, _event, workspaceId) => services.chatTree.getTabsUiState(workspaceId),
  });

  registerInvokeHandler<[string, TabStateItem[]], TabsUiState>(context, registeredChannels, {
    channel: IPC_CHANNELS.workspaces.setTabsUiState,
    parseArgs: (args) => {
      expectArgCount(args, 2);
      return [parseValidWorkspaceId(args[0]), parseTabsArray(args[1])];
    },
    handler: ({ services }, _event, workspaceId, tabs) =>
      services.chatTree.setTabsUiState(workspaceId, tabs),
  });
}
