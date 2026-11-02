import type { HanokiUiMessage } from "../chat/message-metadata";
import { normalizeAssistantTiptapParts } from "../tiptap/extensions";
import { getStepPartId, type WorkflowRunState, type WorkflowStepState } from "./run";

/** A workflow message as it is stored: the run, one part per step, then the reply text. */
export function buildWorkflowMessageParts(
  run: WorkflowRunState,
  steps: Iterable<WorkflowStepState>,
  text: string | null,
): HanokiUiMessage["parts"] {
  const parts: HanokiUiMessage["parts"] = [
    { type: "data-workflowRun", id: run.runId, data: run },
    ...Array.from(steps, (step) => ({
      type: "data-workflowStep" as const,
      id: getStepPartId(run.runId, step.nodeId),
      data: step,
    })),
  ];
  if (text?.trim()) {
    parts.push(...normalizeAssistantTiptapParts([{ type: "text", text, state: "done" }]));
  }
  return parts;
}
