import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";
import { getChatQueryOptions } from "@/queries/chats";
import { getItemQueryOptions } from "@/queries/items";
import { listModelsQueryOptions } from "@/queries/models";
import { listProvidersQueryOptions } from "@/queries/providers";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import type { ItemInfo, ProviderInfo, ProviderModelInfo, WorkflowInfo } from "@shared/ipc";
import type { WorkflowModelOverride } from "@shared/workflow/graph";
import {
  findUnavailableWorkflowSteps,
  formatUnavailableStepsMessage,
  getWorkflowModelUnavailableReason,
  getWorkflowRunBlockReason,
  type WorkflowModelUnavailableReason,
} from "@shared/workflow/model-availability";
import { getWorkflowRun, getWorkflowSteps, planWorkflowRerun } from "@shared/workflow/run";

import { useWorkflowLoadState, type WorkflowLoadState } from "./workflow-graph-store";

type GetModelUnavailableReason = (modelId: string) => WorkflowModelUnavailableReason | null;
type WorkflowOverrides = Readonly<Record<string, WorkflowModelOverride>> | undefined;

function createGetModelUnavailableReason(
  models: readonly ProviderModelInfo[],
  providers: readonly ProviderInfo[],
): GetModelUnavailableReason {
  const byId = new Map(models.map((model) => [model.id, model]));
  const providerIds = new Set(providers.map((provider) => provider.id));
  return (modelId: string) => {
    const model = byId.get(modelId);
    return getWorkflowModelUnavailableReason(
      model && { ...model, hasProvider: providerIds.has(model.providerId) },
    );
  };
}

/**
 * The shared availability rule against the renderer's model and provider
 * lists. Null until both have loaded, so nothing flashes as removed.
 */
export function useGetModelUnavailableReason(): GetModelUnavailableReason | null {
  const { data: models } = useQuery(listModelsQueryOptions);
  const { data: providers } = useQuery(listProvidersQueryOptions);
  return React.useMemo(
    () => (models && providers ? createGetModelUnavailableReason(models, providers) : null),
    [models, providers],
  );
}

/** Why `load` can't run with these overrides; null while anything is still loading. */
function useBlockReason(load: WorkflowLoadState, overrides: WorkflowOverrides): string | null {
  const getReason = useGetModelUnavailableReason();
  return React.useMemo(() => {
    if (load.status === "loading") return null;
    if (load.status === "ready" && !load.workflow.data.graphError && !getReason) return null;
    return getWorkflowRunBlockReason({
      workflow: load.workflow,
      overrides,
      getReason: getReason ?? (() => null),
    });
  }, [getReason, load, overrides]);
}

export interface ChatWorkflowStatus {
  workflowId: string | null;
  load: WorkflowLoadState;
  overrides: WorkflowOverrides;
  /** Why a reply can't run through the chat's workflow right now; null when it can. */
  blockReason: string | null;
}

/** The chat's workflow and whether new replies can run through it. */
export function useChatWorkflowStatus(chatId: string): ChatWorkflowStatus {
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const workflowId = chat?.data.settings.workflowId ?? null;
  const load = useWorkflowLoadState(workflowId);
  const overrides = workflowId
    ? chat?.data.settings.workflowModelOverrides?.[workflowId]
    : undefined;
  const blockReason = useBlockReason(load, workflowId ? overrides : undefined);
  return { workflowId, load, overrides, blockReason: workflowId ? blockReason : null };
}

/** Why a reply can't run through `workflowId` in this chat; null when it can or while loading. */
export function useWorkflowBlockReason(chatId: string, workflowId: string): string | null {
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const load = useWorkflowLoadState(workflowId);
  return useBlockReason(load, chat?.data.settings.workflowModelOverrides?.[workflowId]);
}

/** The step names to fix in the chat's workflow, for its sidebar card. */
export function useChatWorkflowUnavailableStepsMessage(status: ChatWorkflowStatus): string | null {
  const getReason = useGetModelUnavailableReason();
  return React.useMemo(() => {
    if (status.load.status !== "ready" || !getReason) return null;
    const steps = findUnavailableWorkflowSteps({
      graph: status.load.workflow.data.graph,
      overrides: status.overrides,
      getReason,
    });
    return steps.length > 0 ? formatUnavailableStepsMessage(steps) : null;
  }, [getReason, status.load, status.overrides]);
}

async function loadWorkflow(workflowId: string): Promise<WorkflowInfo | null> {
  const options = getItemQueryOptions(workflowId);
  if (queryClient.getQueryState(options.queryKey)?.status === "error") return null;
  try {
    const item: ItemInfo = await queryClient.ensureQueryData(options);
    return item.type === "workflow" ? item : null;
  } catch {
    return null;
  }
}

/**
 * Why a chat request with this body would be refused for its workflow, checked
 * before anything is sent or removed; null when it can go ahead (or runs no
 * workflow). Mirrors which workflow the server picks: an explicit pick, a
 * rerun of a run, or the chat's own.
 */
export async function getChatRequestWorkflowBlockReason({
  chatId,
  body,
  messages,
}: {
  chatId: string;
  body: Record<string, unknown> | undefined;
  messages: readonly HanokiUiMessage[];
}): Promise<string | null> {
  if (body?.noWorkflow === true || body?.revision) return null;
  const request =
    typeof body?.workflow === "object" && body.workflow !== null
      ? (body.workflow as {
          workflowId?: string;
          rerun?: { sourceMessageId: string; nodeId: string };
        })
      : {};

  const [chat, models, providers] = await Promise.all([
    queryClient.ensureQueryData(getChatQueryOptions(chatId)),
    queryClient.ensureQueryData(listModelsQueryOptions),
    queryClient.ensureQueryData(listProvidersQueryOptions),
  ]);
  const getReason = createGetModelUnavailableReason(models, providers);
  const overridesFor = (workflowId: string | null) =>
    workflowId ? chat.data.settings.workflowModelOverrides?.[workflowId] : undefined;

  if (request.rerun) {
    const { sourceMessageId, nodeId } = request.rerun;
    const source = messages.find((message) => message.id === sourceMessageId);
    const run = source ? getWorkflowRun(source) : null;
    if (!source || !run) return null;
    // As on the server: the workflow as it is now when it still has the step,
    // else the run's own snapshot.
    const workflow = run.workflowId ? await loadWorkflow(run.workflowId) : null;
    const useCurrent =
      workflow !== null &&
      !workflow.data.graphError &&
      workflow.data.graph.nodes.some((node) => node.id === nodeId);
    const graph = useCurrent ? workflow.data.graph : run.graph;
    if (!graph.nodes.some((node) => node.id === nodeId)) return null;
    const plan = planWorkflowRerun(graph, nodeId, getWorkflowSteps(source));
    return getWorkflowRunBlockReason({
      workflow: { title: run.name, data: { graph } },
      overrides: overridesFor(useCurrent ? workflow.id : run.workflowId),
      skip: new Set([...plan.reused, ...plan.skipped]),
      getReason,
    });
  }

  const workflowId = request.workflowId ?? chat.data.settings.workflowId ?? null;
  if (!workflowId) return null;
  return getWorkflowRunBlockReason({
    workflow: await loadWorkflow(workflowId),
    overrides: overridesFor(workflowId),
    getReason,
  });
}
