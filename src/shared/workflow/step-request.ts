import type { ModelMessage } from "ai";

import { mergeSameRoleTurns } from "../chat/model-message-turns";
import {
  getAncestorIds,
  getIncomingMap,
  isStepNode,
  renderTemplate,
  templateUsesInput,
  type WorkflowAiNode,
  type WorkflowGraph,
  type WorkflowNode,
} from "./graph";

export interface StepContext {
  /** The chat history as a normal reply would see it, ending with the request. */
  messages: ModelMessage[];
  /** The chat's own instructions. */
  instructions: string | undefined;
}

export interface StepRequest {
  system: string | undefined;
  messages: ModelMessage[];
  /** Text the model continues from; it leads the step's output. */
  prefix: string;
}

/**
 * The XML tag a step's input is wrapped in when it is sent with a prompt:
 * the key of the step it comes from (`<draft>`), `<request>` for the message
 * itself. Prompts can refer to it by that name.
 */
export function getInputTag(parent: WorkflowNode | undefined): string {
  if (!parent) return "input";
  if (parent.type === "input") return "request";
  if (parent.type === "ai" || parent.type === "merge") return parent.key;
  return "input";
}

/**
 * What one AI step sends to its model.
 *
 * - Context on: the chat history and instructions first, the same as a
 *   regular reply. When the input is the request itself it is already the
 *   last turn of that history, so it is not repeated.
 * - Input with a prompt (role Natural or User): one user turn holding the
 *   input in a tag named after where it comes from, then the prompt. The text
 *   to work on stays apart from the instruction and, with context on, from the
 *   conversation before it. Sent as an earlier assistant turn instead, "the
 *   text above" reads as the whole chat, and a reviewer reviews every scene.
 * - Input without a prompt: Natural takes whichever role alternates with the
 *   turn before it; an assistant-role input is continued by the model.
 * - Role Assistant with a prompt: the input as the model's own turn, then the
 *   prompt, for a model that should treat it as its own draft.
 * - A prompt that places `{{input}}` itself gets no separate input.
 * - Nothing opens with an assistant turn: with no history before it, the
 *   input goes as a user turn.
 * - Turns of the same role in a row are merged, which some providers require.
 */
export function buildStepRequest(
  node: WorkflowAiNode,
  input: string,
  parent: WorkflowNode | undefined,
  context: StepContext,
  steps: ReadonlyMap<string, string>,
): StepRequest | null {
  const values = { input, steps };
  const prompt = renderTemplate(node.prompt, values).trim();
  const nodeSystem = renderTemplate(node.systemPrompt, values).trim();
  const system =
    [node.includeContext ? (context.instructions ?? "") : "", nodeSystem]
      .filter((part) => part.length > 0)
      .join("\n\n") || undefined;
  const messages: ModelMessage[] = node.includeContext ? [...context.messages] : [];
  const inputInHistory = node.includeContext && parent?.type === "input";
  const sendInput = !inputInHistory && !templateUsesInput(node.prompt) && input.trim().length > 0;
  const preferredRole =
    node.role === "natural"
      ? prompt || messages.at(-1)?.role !== "user"
        ? "user"
        : "assistant"
      : node.role;
  // Providers reject a conversation that opens with the model's own turn.
  const role = messages.length === 0 ? "user" : preferredRole;
  let prefix = "";

  if (sendInput && role === "user" && prompt) {
    messages.push({ role, content: `${wrapInTag(getInputTag(parent), input)}\n\n${prompt}` });
  } else {
    if (sendInput && role === "assistant" && !prompt) {
      // Continued by the model; providers reject a prefill that ends in whitespace.
      prefix = input.trimEnd();
      messages.push({ role, content: prefix });
    } else if (sendInput) {
      messages.push({ role, content: input });
    }
    if (prompt) messages.push({ role: "user", content: prompt });
  }

  return messages.length > 0 ? { system, messages: mergeSameRoleTurns(messages), prefix } : null;
}

function wrapInTag(tag: string, text: string): string {
  return `<${tag}>\n${text.trim()}\n</${tag}>`;
}

/**
 * The request an AI step would send, with placeholders for what only a run
 * knows (the chat, the steps' outputs), so the editor can show it. Built by
 * `buildStepRequest` itself, so it can't drift from what is sent.
 */
export function previewStepRequest(graph: WorkflowGraph, nodeId: string): StepRequest | null {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node?.type !== "ai") return null;
  const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const parent = nodesById.get(getIncomingMap(graph).get(nodeId)?.[0] ?? "");
  const outputOf = (step: WorkflowNode | undefined): string =>
    !step
      ? "[nothing is connected]"
      : step.type === "input"
        ? "[your message]"
        : isStepNode(step)
          ? `[output of “${step.name}”]`
          : "";
  const steps = new Map<string, string>();
  for (const id of getAncestorIds(graph, nodeId)) {
    const ancestor = nodesById.get(id);
    if (ancestor && isStepNode(ancestor)) steps.set(ancestor.key, outputOf(ancestor));
  }
  return buildStepRequest(
    node,
    outputOf(parent),
    parent,
    {
      messages: [{ role: "user", content: "[the chat so far, ending with your message]" }],
      instructions: "[the chat's instructions]",
    },
    steps,
  );
}
