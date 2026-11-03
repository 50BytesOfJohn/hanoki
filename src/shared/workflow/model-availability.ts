import {
  getPassModels,
  isModelNode,
  type WorkflowGraph,
  type WorkflowModelNode,
  type WorkflowModelOverride,
  type WorkflowModelRef,
} from "./graph";

/**
 * Why a step's model can't run:
 * - `removed`: the model is gone — not found, no longer offered by its
 *   provider (lifecycle status other than active), or its provider was deleted.
 * - `disabled`: the model exists but is turned off.
 */
export type WorkflowModelUnavailableReason = "removed" | "disabled";

/** What the rule needs to know about a model; both the DB row and `ProviderModelInfo` fit. */
export interface WorkflowModelAvailabilityInfo {
  isEnabled: boolean;
  /** Lifecycle status; only `active` models can run. */
  status: string;
  /** False when the model's provider no longer exists. Defaults to true. */
  hasProvider?: boolean;
}

/** Null when the model can run. */
export function getWorkflowModelUnavailableReason(
  model: WorkflowModelAvailabilityInfo | null | undefined,
): WorkflowModelUnavailableReason | null {
  if (!model || model.status !== "active" || model.hasProvider === false) return "removed";
  if (!model.isEnabled) return "disabled";
  return null;
}

export function formatWorkflowModelUnavailable(reason: WorkflowModelUnavailableReason): string {
  return reason === "removed" ? "Model removed" : "Model turned off";
}

/**
 * The model a step pins for this chat: the chat's override, else the step's
 * own model. Null means it runs with the chat's model.
 */
export function getStepPinnedModel(
  node: Pick<WorkflowModelNode, "model">,
  override: WorkflowModelOverride | null | undefined,
): WorkflowModelRef | null {
  if (override === "chat") return null;
  return override ?? node.model;
}

export interface UnavailableWorkflowStep {
  nodeId: string;
  name: string;
  modelId: string;
  reason: WorkflowModelUnavailableReason;
}

/**
 * Enabled model steps (AI steps and Decisions) that would run with a model
 * that can't run, on any pass. Disabled steps pass their input through and
 * `skip` (e.g. steps a rerun keeps) don't call a model, so neither blocks a run. Steps on the chat's model are left to the
 * chat's own model check.
 */
export function findUnavailableWorkflowSteps({
  graph,
  overrides,
  skip,
  getReason,
}: {
  graph: WorkflowGraph;
  overrides?: Readonly<Record<string, WorkflowModelOverride>> | null;
  skip?: ReadonlySet<string>;
  getReason: (modelId: string) => WorkflowModelUnavailableReason | null;
}): UnavailableWorkflowStep[] {
  const unavailable: UnavailableWorkflowStep[] = [];
  for (const node of graph.nodes) {
    if (!isModelNode(node) || node.disabled || skip?.has(node.id)) continue;
    const models = [
      getStepPinnedModel(node, overrides?.[node.id]),
      ...(node.type === "ai" ? getPassModels(node) : []),
    ];
    for (const model of models) {
      const reason = model ? getReason(model.modelId) : null;
      if (!model || !reason) continue;
      unavailable.push({ nodeId: node.id, name: node.name, modelId: model.modelId, reason });
      break;
    }
  }
  return unavailable;
}

/** One sentence naming the steps to fix, e.g. `Pick a new model for “Review”: its model was removed.` */
export function formatUnavailableStepsMessage(steps: readonly UnavailableWorkflowStep[]): string {
  const [step, ...rest] = steps;
  if (!step) return "";
  if (rest.length === 0) {
    return `Pick a new model for “${step.name}”: its model ${
      step.reason === "removed" ? "was removed" : "is turned off"
    }.`;
  }
  const names = steps.map((step) => `“${step.name}”`);
  const list = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const reasons = new Set(steps.map((step) => step.reason));
  const why =
    reasons.size > 1
      ? "their models were removed or turned off"
      : reasons.has("removed")
        ? "their models were removed"
        : "their models are turned off";
  return `Pick new models for ${list}: ${why}.`;
}

/** The provider's own model id from an app model id (`<providerId>:<providerModelId>`). */
export function getProviderModelIdFromModelId(modelId: string): string {
  const separator = modelId.indexOf(":");
  return separator >= 0 && separator < modelId.length - 1 ? modelId.slice(separator + 1) : modelId;
}

export function formatWorkflowGraphError(title: string): string {
  return `“${title}” can't be read, so it can't run. Its saved data was left as it is.`;
}

/** What a run needs to know about its workflow; null when it no longer exists. */
export interface WorkflowRunTarget {
  title: string;
  data: { graph: WorkflowGraph; graphError?: string };
}

/**
 * Why a workflow can't run for a chat right now, as one sentence; null when it
 * can. The renderer and the server give the same reasons.
 */
export function getWorkflowRunBlockReason({
  workflow,
  overrides,
  skip,
  getReason,
}: {
  workflow: WorkflowRunTarget | null;
  overrides?: Readonly<Record<string, WorkflowModelOverride>> | null;
  skip?: ReadonlySet<string>;
  getReason: (modelId: string) => WorkflowModelUnavailableReason | null;
}): string | null {
  if (!workflow) return "This workflow was deleted. Pick another one or remove it.";
  if (workflow.data.graphError) return formatWorkflowGraphError(workflow.title);
  const unavailable = findUnavailableWorkflowSteps({
    graph: workflow.data.graph,
    overrides,
    skip,
    getReason,
  });
  return unavailable.length > 0 ? formatUnavailableStepsMessage(unavailable) : null;
}
