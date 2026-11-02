import type { WorkflowInputRole } from "@shared/workflow/graph";

const INPUT_ROLE_LABELS = {
  natural: "natural turns",
  user: "input as user",
  assistant: "input as assistant",
} satisfies Record<WorkflowInputRole, string>;

export function formatInputRole(role: WorkflowInputRole): string {
  return INPUT_ROLE_LABELS[role];
}
