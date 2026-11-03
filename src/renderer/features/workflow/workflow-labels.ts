import type { WorkflowInputRole } from "@shared/workflow/graph";

const INPUT_ROLE_LABELS = {
  natural: "natural turns",
  user: "input as user",
  assistant: "input as assistant",
} satisfies Record<WorkflowInputRole, string>;

export function formatInputRole(role: WorkflowInputRole): string {
  return INPUT_ROLE_LABELS[role];
}

export function formatRetries(retries: number): string {
  return retries === 1 ? "Retries once" : `Retries ${retries}×`;
}

/** For a step that switches models on a loop's later passes. */
export function formatPassModels(count: number): string {
  return `${count + 1} models by pass`;
}
