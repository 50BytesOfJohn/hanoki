import { parseChatId } from "@shared/chat/chat-id";
import { parseChatTitle } from "@shared/chat/chat-title";
import { parseFolderId } from "@shared/folder/folder-id";
import { IPC_CHANNELS, type WorkflowInfo, type WorkflowSummary } from "@shared/ipc";
import { parseWorkflowGraph, type WorkflowGraph } from "@shared/workflow/graph";
import { parseWorkspaceId } from "@shared/workspace/workspace-id";
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
  const parsed = parseWorkspaceId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

/** Workflow ids are item ids, which share the chat id format. */
function parseValidWorkflowId(input: unknown): string {
  const parsed = parseChatId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error.replace("Chat", "Workflow"));
  }

  return parsed.value;
}

function parseValidWorkflowTitle(input: unknown): string {
  const parsed = parseChatTitle(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error.replace("Chat", "Workflow"));
  }

  return parsed.value;
}

function parseNullableFolderId(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const parsed = parseFolderId(input);
  if (!parsed.ok) {
    throw AppError.badRequest(parsed.error);
  }

  return parsed.value;
}

function parseValidWorkflowGraph(input: unknown): WorkflowGraph {
  const parsed = parseWorkflowGraph(input);
  if (!parsed.ok) {
    throw AppError.badRequest(`Invalid workflow: ${parsed.error}`);
  }

  return parsed.value;
}

export function registerWorkflowsIpcModule(
  context: IpcHandlerContext,
  registeredChannels: Set<string>,
): void {
  registerInvokeHandler<[string, string, string | null], WorkflowInfo>(
    context,
    registeredChannels,
    {
      channel: IPC_CHANNELS.workflows.create,
      parseArgs: (args): [string, string, string | null] => {
        expectArgCount(args, 2, 3);
        return [
          parseValidWorkspaceId(args[0]),
          parseValidWorkflowTitle(args[1]),
          parseNullableFolderId(args[2]),
        ];
      },
      handler: ({ services }, _event, workspace, title, folderId) =>
        services.chatTree.createWorkflow({ workspaceId: workspace, title, folderId }),
    },
  );
  registerInvokeHandler<[string, WorkflowGraph], WorkflowInfo>(context, registeredChannels, {
    channel: IPC_CHANNELS.workflows.updateGraph,
    parseArgs: (args): [string, WorkflowGraph] => {
      expectArgCount(args, 2);
      return [parseValidWorkflowId(args[0]), parseValidWorkflowGraph(args[1])];
    },
    handler: ({ services }, _event, id, nextGraph) =>
      services.chatTree.updateWorkflowGraph(id, nextGraph),
  });
  registerInvokeHandler<[string], WorkflowSummary[]>(context, registeredChannels, {
    channel: IPC_CHANNELS.workflows.list,
    parseArgs: (args): [string] => {
      expectArgCount(args, 1);
      return [parseValidWorkspaceId(args[0])];
    },
    handler: ({ services }, _event, workspace) => services.chatTree.listWorkflows(workspace),
  });
}
