import { type } from "arktype";

import type { ReasoningEffort } from "../models/reasoning";

/**
 * A workflow is a small DAG that a chat request runs through before its result
 * lands in the chat. One Input and one Output; AI steps call a model; Merge
 * steps join several outputs with a template. Fan-out (one output feeding
 * several steps) runs branches in parallel. No loops.
 */
export type WorkflowNodeType = "input" | "output" | "ai" | "merge";

/**
 * Which role the step's input is sent as: a text to work on (`user`), the
 * model's own draft (`assistant`), or whichever keeps turns alternating after
 * what comes before it (`natural`), for providers that reject two turns of the
 * same role in a row.
 */
export type WorkflowInputRole = "natural" | "user" | "assistant";

/**
 * What an AI step that fails (an error, or a reply with no text) does to its
 * run: `stop` ends the whole run, `continue` hands on whatever it wrote.
 */
export type WorkflowFailureMode = "stop" | "continue";

export interface WorkflowModelRef {
  modelId: string;
  /** Null is the provider default. */
  reasoningEffort: ReasoningEffort | null;
}

/** A chat's per-step pick: a specific model, or the chat's own model over the workflow's. */
export type WorkflowModelOverride = WorkflowModelRef | "chat";

export interface WorkflowPosition {
  x: number;
  y: number;
}

interface WorkflowNodeBase {
  id: string;
  position: WorkflowPosition;
}

export interface WorkflowInputNode extends WorkflowNodeBase {
  type: "input";
}

export interface WorkflowOutputNode extends WorkflowNodeBase {
  type: "output";
}

export interface WorkflowAiNode extends WorkflowNodeBase {
  type: "ai";
  name: string;
  /** Referenced from templates as `{{step.<key>}}`. */
  key: string;
  /** Null uses the chat's model. */
  model: WorkflowModelRef | null;
  systemPrompt: string;
  prompt: string;
  includeContext: boolean;
  role: WorkflowInputRole;
  /** A disabled step passes its input through unchanged. */
  disabled: boolean;
  /** Absent is `stop`; graphs saved before the setting existed have none. */
  onFailure?: WorkflowFailureMode;
}

export interface WorkflowMergeNode extends WorkflowNodeBase {
  type: "merge";
  name: string;
  key: string;
  /** Empty joins every input with a blank line, in connection order. */
  template: string;
  disabled: boolean;
}

export type WorkflowStepNode = WorkflowAiNode | WorkflowMergeNode;
export type WorkflowNode = WorkflowInputNode | WorkflowOutputNode | WorkflowStepNode;

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const WORKFLOW_MAX_NODES = 64;
export const WORKFLOW_MAX_TEXT_LENGTH = 100_000;
export const WORKFLOW_KEY_PATTERN = /^[a-z0-9_]{1,40}$/;
export const DEFAULT_WORKFLOW_TITLE = "New workflow";

const textSchema = type(`string <= ${WORKFLOW_MAX_TEXT_LENGTH}`);
const nameSchema = type("0 < string <= 80");
const keySchema = type(WORKFLOW_KEY_PATTERN);
// Undeclared keys are dropped, so a graph never stores more than these fields.
const positionSchema = type({ "+": "delete", x: "number", y: "number" });
const modelRefSchema = type({
  "+": "delete",
  modelId: "0 < string <= 200",
  reasoningEffort: "'none'|'minimal'|'low'|'medium'|'high'|'xhigh'|null",
});

export function parseWorkflowModelRef(input: unknown): WorkflowModelRef | null {
  const parsed = modelRefSchema(input);
  return parsed instanceof type.errors ? null : parsed;
}

export function parseWorkflowModelOverride(input: unknown): WorkflowModelOverride | null {
  return input === "chat" ? "chat" : parseWorkflowModelRef(input);
}

const nodeSchema = type({
  "+": "delete",
  id: "0 < string <= 64",
  type: "'input'|'output'",
  position: positionSchema,
})
  .or({
    "+": "delete",
    id: "0 < string <= 64",
    type: "'ai'",
    position: positionSchema,
    name: nameSchema,
    key: keySchema,
    model: modelRefSchema.or("null"),
    systemPrompt: textSchema,
    prompt: textSchema,
    includeContext: "boolean",
    role: "'natural'|'user'|'assistant'",
    disabled: "boolean",
    "onFailure?": "'stop'|'continue'",
  })
  .or({
    "+": "delete",
    id: "0 < string <= 64",
    type: "'merge'",
    position: positionSchema,
    name: nameSchema,
    key: keySchema,
    template: textSchema,
    disabled: "boolean",
  });

const graphSchema = type({
  "+": "delete",
  nodes: nodeSchema.array().atMostLength(WORKFLOW_MAX_NODES),
  edges: type({
    "+": "delete",
    id: "0 < string <= 160",
    source: "0 < string <= 64",
    target: "0 < string <= 64",
  })
    .array()
    .atMostLength(WORKFLOW_MAX_NODES * 4),
});

type ParseWorkflowGraphResult = { ok: true; value: WorkflowGraph } | { ok: false; error: string };

/** Validates shape and structure: one Input, one Output, known edge ends, valid fan-in, no cycles. */
export function parseWorkflowGraph(input: unknown): ParseWorkflowGraphResult {
  const parsed = graphSchema(input);
  if (parsed instanceof type.errors) {
    return { ok: false, error: parsed.summary };
  }
  // SAFETY: the schema above checks every field of `WorkflowGraph`; arktype infers
  // the node union with widened literal unions that TypeScript cannot narrow back.
  const graph = parsed as WorkflowGraph;
  const error = getStructuralError(graph);
  return error ? { ok: false, error } : { ok: true, value: graph };
}

/**
 * Why the editor can't save `graph`, in words for the user; null when it can.
 * Field problems the editor can cause are named first; anything else falls
 * back to the parser's own message.
 */
export function getWorkflowGraphProblem(graph: WorkflowGraph): string | null {
  for (const node of graph.nodes) {
    if (!isStepNode(node)) continue;
    const label = node.name.trim() ? `“${node.name}”` : "A step";
    if (!node.name.trim()) return "A step has no name.";
    if (node.name.length > 80) return `${label} has a name longer than 80 characters.`;
    const texts: [string, string][] =
      node.type === "ai"
        ? [
            ["prompt", node.prompt],
            ["system prompt", node.systemPrompt],
          ]
        : [["template", node.template]];
    for (const [field, text] of texts) {
      if (text.length > WORKFLOW_MAX_TEXT_LENGTH) {
        return `${label} has a ${field} longer than ${WORKFLOW_MAX_TEXT_LENGTH.toLocaleString("en")} characters.`;
      }
    }
  }
  const parsed = parseWorkflowGraph(graph);
  return parsed.ok ? null : parsed.error;
}

function getStructuralError(graph: WorkflowGraph): string | null {
  const nodesById = new Map<string, WorkflowNode>();
  const keys = new Set<string>();
  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) return `Node "${node.id}" appears twice.`;
    nodesById.set(node.id, node);
    if (isStepNode(node)) {
      if (keys.has(node.key)) return `Two steps use the key "${node.key}".`;
      keys.add(node.key);
    }
  }
  if (graph.nodes.filter((node) => node.type === "input").length !== 1) {
    return "A workflow needs exactly one Input.";
  }
  if (graph.nodes.filter((node) => node.type === "output").length !== 1) {
    return "A workflow needs exactly one Output.";
  }

  const pairs = new Set<string>();
  const incomingCount = new Map<string, number>();
  for (const edge of graph.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) return `Connection "${edge.id}" points at a missing node.`;
    if (source.type === "output") return "Output cannot connect onwards.";
    if (target.type === "input") return "Nothing can connect into Input.";
    const pair = `${edge.source}->${edge.target}`;
    if (pairs.has(pair) || edge.source === edge.target) return "Connections must be unique.";
    pairs.add(pair);
    const count = (incomingCount.get(edge.target) ?? 0) + 1;
    incomingCount.set(edge.target, count);
    if (count > 1 && target.type !== "merge") {
      return "Only Merge steps accept more than one connection.";
    }
  }

  return topologicalOrder(graph) ? null : "Workflows cannot contain loops.";
}

export function getFailureMode(node: WorkflowAiNode): WorkflowFailureMode {
  return node.onFailure ?? "stop";
}

export function isStepNode(node: WorkflowNode): node is WorkflowStepNode {
  return node.type === "ai" || node.type === "merge";
}

export function getNodeLabel(node: WorkflowNode): string {
  if (node.type === "input") return "Input";
  if (node.type === "output") return "Output";
  return node.name;
}

/** Incoming source ids per node, in connection order. */
export function getIncomingMap(graph: WorkflowGraph): Map<string, string[]> {
  const incoming = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge.source);
  return incoming;
}

function getOutgoingMap(graph: WorkflowGraph): Map<string, string[]> {
  const outgoing = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);
  return outgoing;
}

/** Kahn's algorithm, stable on node order; null when the graph has a cycle. */
export function topologicalOrder(graph: WorkflowGraph): WorkflowNode[] | null {
  const incoming = getIncomingMap(graph);
  const outgoing = getOutgoingMap(graph);
  const remaining = new Map(graph.nodes.map((node) => [node.id, incoming.get(node.id)!.length]));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const ready = graph.nodes.filter((node) => remaining.get(node.id) === 0).map((node) => node.id);
  const order: WorkflowNode[] = [];

  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(nodesById.get(id)!);
    for (const target of outgoing.get(id) ?? []) {
      const left = remaining.get(target)! - 1;
      remaining.set(target, left);
      if (left === 0) ready.push(target);
    }
  }

  return order.length === graph.nodes.length ? order : null;
}

/** Every node upstream of `nodeId`, following connections backwards. */
export function getAncestorIds(graph: WorkflowGraph, nodeId: string): Set<string> {
  return walk(getIncomingMap(graph), nodeId);
}

/** Every node downstream of `nodeId`. */
export function getDescendantIds(graph: WorkflowGraph, nodeId: string): Set<string> {
  return walk(getOutgoingMap(graph), nodeId);
}

function walk(neighbours: Map<string, string[]>, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(neighbours.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(neighbours.get(id) ?? []));
  }
  return seen;
}

export type WorkflowConnectionCheck = { ok: true } | { ok: false; reason: string };

/** Whether the editor may add `source → target`. */
export function canConnect(
  graph: WorkflowGraph,
  source: string,
  target: string,
): WorkflowConnectionCheck {
  const sourceNode = graph.nodes.find((node) => node.id === source);
  const targetNode = graph.nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode || source === target) return { ok: false, reason: "Invalid" };
  if (sourceNode.type === "output") return { ok: false, reason: "Output is the end." };
  if (targetNode.type === "input") return { ok: false, reason: "Input is the start." };
  if (graph.edges.some((edge) => edge.source === source && edge.target === target)) {
    return { ok: false, reason: "Already connected." };
  }
  if (targetNode.type !== "merge" && graph.edges.some((edge) => edge.target === target)) {
    return { ok: false, reason: "Only Merge accepts several inputs." };
  }
  if (source === target || getAncestorIds(graph, source).has(target)) {
    return { ok: false, reason: "Loops are not supported." };
  }
  return { ok: true };
}

/** Step nodes whose result never reaches Output; they still run. */
export function getNodesNotReachingOutput(graph: WorkflowGraph): Set<string> {
  const output = graph.nodes.find((node) => node.type === "output");
  const reaching = output ? getAncestorIds(graph, output.id) : new Set<string>();
  return new Set(
    graph.nodes.filter((node) => isStepNode(node) && !reaching.has(node.id)).map((node) => node.id),
  );
}

/**
 * Steps connected into a Merge whose template never reads them, so their
 * output is dropped. Typical after duplicating a Merge: the copy is wired to
 * new steps but its template still names the old ones. An empty template or
 * one using `{{input}}` reads every input. Input itself can only be read
 * through `{{input}}`, so it is not reported.
 */
export function getUnusedMergeInputs(
  graph: WorkflowGraph,
  node: WorkflowMergeNode,
): WorkflowStepNode[] {
  if (node.disabled || !node.template.trim() || templateUsesInput(node.template)) return [];
  const used = new Set(getTemplateReferences(node.template));
  const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  return (getIncomingMap(graph).get(node.id) ?? []).flatMap((id) => {
    const source = nodesById.get(id);
    return source && isStepNode(source) && !used.has(source.key) ? [source] : [];
  });
}

/**
 * A Merge template that reads each connected step once, each in a tag named
 * after it, in run order: a text comes before the review of it, so the text is
 * the Merge's main path and the fallback when a run stops early.
 */
export function createMergeTemplate(graph: WorkflowGraph, nodeId: string): string {
  const sources = new Set(getIncomingMap(graph).get(nodeId) ?? []);
  return (topologicalOrder(graph) ?? graph.nodes)
    .filter((node): node is WorkflowStepNode => sources.has(node.id) && isStepNode(node))
    .map((source) => `<${source.key}>\n{{step.${source.key}}}\n</${source.key}>`)
    .join("\n\n");
}

/** What the editor flags on a step, if anything. */
export function getStepWarnings(graph: WorkflowGraph): Map<string, string> {
  const warnings = new Map<string, string>();
  const notReaching = getNodesNotReachingOutput(graph);
  for (const node of graph.nodes) {
    if (!isStepNode(node)) continue;
    const unused = node.type === "merge" ? getUnusedMergeInputs(graph, node) : [];
    if (unused.length > 0) {
      const names = unused.map((source) => `“${source.name}”`).join(" and ");
      warnings.set(
        node.id,
        `The template doesn't use ${names}, so ${unused.length === 1 ? "its" : "their"} output is dropped.`,
      );
    } else if (notReaching.has(node.id)) {
      warnings.set(node.id, "Not connected to Output. It still runs and is saved in the run.");
    }
  }
  return warnings;
}

/** Step nodes in the order they can run, for lists such as the chat sidebar. */
export function getOrderedSteps(graph: WorkflowGraph): WorkflowStepNode[] {
  return (topologicalOrder(graph) ?? graph.nodes).filter(isStepNode);
}

/**
 * The spine that leads to Output: walking back from Output through each step's
 * input, and through a Merge's primary input (the first one its template uses,
 * else the first connected). Ordered from Output backwards.
 *
 * When a run stops, the message falls back to the last finished AI step on this
 * path, so a draft → review → merge → rewrite flow falls back to the draft
 * rather than to the review.
 */
export function getMainPath(graph: WorkflowGraph): WorkflowNode[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = getIncomingMap(graph);
  const keyToId = new Map(
    graph.nodes.filter(isStepNode).map((node) => [node.key, node.id] as const),
  );
  const path: WorkflowNode[] = [];
  const seen = new Set<string>();
  let current: WorkflowNode | undefined = graph.nodes.find((node) => node.type === "output");

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    const sources: string[] = incoming.get(current.id) ?? [];
    let nextId: string | undefined = sources[0];
    if (current.type === "merge") {
      const referenced: string | undefined = getTemplateReferences(current.template)
        .map((key) => keyToId.get(key))
        .find((id) => id !== undefined && sources.includes(id));
      nextId = referenced ?? nextId;
    }
    current = nextId ? nodesById.get(nextId) : undefined;
  }

  return path;
}

const TEMPLATE_PATTERN = /\{\{\s*(input|step\.([a-z0-9_]+))\s*\}\}/g;

/** Step keys a template mentions, in order of first appearance. */
export function getTemplateReferences(template: string): string[] {
  const keys: string[] = [];
  for (const match of template.matchAll(TEMPLATE_PATTERN)) {
    const key = match[2];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function templateUsesInput(template: string): boolean {
  for (const match of template.matchAll(TEMPLATE_PATTERN)) {
    if (match[1] === "input") return true;
  }
  return false;
}

/**
 * Fills `{{input}}` and `{{step.<key>}}`. Unknown or unavailable steps render
 * as an empty string: a template may only read steps that run before it.
 */
export function renderTemplate(
  template: string,
  values: { input: string; steps: ReadonlyMap<string, string> },
): string {
  return template.replace(TEMPLATE_PATTERN, (_match, token: string, key: string | undefined) =>
    token === "input" ? values.input : (values.steps.get(key ?? "") ?? ""),
  );
}

/** A key derived from `name` that no other step uses. */
export function createUniqueStepKey(name: string, graph: WorkflowGraph, ownId?: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "step";
  const taken = new Set(
    graph.nodes.flatMap((node) => (isStepNode(node) && node.id !== ownId ? [node.key] : [])),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function createWorkflowAiNode(
  graph: WorkflowGraph,
  position: WorkflowPosition,
  name = "Step",
): WorkflowAiNode {
  return {
    id: crypto.randomUUID(),
    type: "ai",
    position,
    name,
    key: createUniqueStepKey(name, graph),
    model: null,
    systemPrompt: "",
    prompt: "",
    includeContext: false,
    role: "natural",
    disabled: false,
  };
}

export function createWorkflowMergeNode(
  graph: WorkflowGraph,
  position: WorkflowPosition,
  name = "Merge",
): WorkflowMergeNode {
  return {
    id: crypto.randomUUID(),
    type: "merge",
    position,
    name,
    key: createUniqueStepKey(name, graph),
    template: "",
    disabled: false,
  };
}

export function createWorkflowEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target };
}

/**
 * The first use case, ready to run: a draft, a review of it that checks it
 * against the conversation (e.g. for repeats), and a rewrite that sees both. The draft is the Merge's primary input, so
 * stopping during the rewrite keeps the draft.
 */
export function createDefaultWorkflowGraph(): WorkflowGraph {
  const input: WorkflowInputNode = { id: "input", type: "input", position: { x: 0, y: 160 } };
  const output: WorkflowOutputNode = {
    id: "output",
    type: "output",
    position: { x: 1380, y: 160 },
  };
  const draft: WorkflowAiNode = {
    id: "draft",
    type: "ai",
    position: { x: 220, y: 120 },
    name: "Draft",
    key: "draft",
    model: null,
    systemPrompt: "",
    prompt: "",
    includeContext: true,
    role: "natural",
    disabled: false,
  };
  const review: WorkflowAiNode = {
    id: "review",
    type: "ai",
    position: { x: 520, y: 300 },
    name: "Review",
    key: "review",
    model: null,
    systemPrompt:
      "You are a demanding editor. You never rewrite the text yourself; you point out what to change.",
    prompt:
      "Review the draft in the <draft> tags. Use the conversation before it as reference: flag lines, beats, images and phrasing the draft repeats from earlier messages, and anything that contradicts them, but don't review the earlier messages themselves. List its concrete problems: repetition, clichés, inconsistencies, pacing, voice, and anything that breaks the request. Be specific and quote the passages you mean.",
    includeContext: true,
    role: "natural",
    disabled: false,
  };
  const merge: WorkflowMergeNode = {
    id: "merge",
    type: "merge",
    position: { x: 820, y: 140 },
    name: "Draft + review",
    key: "draft_review",
    template: "<draft>\n{{step.draft}}\n</draft>\n\n<review>\n{{step.review}}\n</review>",
    disabled: false,
  };
  const rewrite: WorkflowAiNode = {
    id: "rewrite",
    type: "ai",
    position: { x: 1100, y: 120 },
    name: "Rewrite",
    key: "rewrite",
    model: null,
    systemPrompt: "",
    prompt:
      "Rewrite the text in the <draft> tags so it addresses every point in the <review> tags. Reply with the rewritten text only, without commentary.",
    includeContext: true,
    role: "natural",
    disabled: false,
  };

  return {
    nodes: [input, draft, review, merge, rewrite, output],
    edges: [
      createWorkflowEdge(input.id, draft.id),
      createWorkflowEdge(draft.id, merge.id),
      createWorkflowEdge(draft.id, review.id),
      createWorkflowEdge(review.id, merge.id),
      createWorkflowEdge(merge.id, rewrite.id),
      createWorkflowEdge(rewrite.id, output.id),
    ],
  };
}

/** Changes a step's key and rewrites every template that mentions it. */
export function renameStepKey(
  graph: WorkflowGraph,
  nodeId: string,
  nextKey: string,
): WorkflowGraph {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target || !isStepNode(target) || target.key === nextKey) return graph;
  const pattern = new RegExp(`\\{\\{\\s*step\\.${target.key}\\s*\\}\\}`, "g");
  const replacement = `{{step.${nextKey}}}`;
  const rewrite = (text: string) => text.replace(pattern, replacement);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.type === "ai") {
        return {
          ...node,
          ...(node.id === nodeId ? { key: nextKey } : {}),
          prompt: rewrite(node.prompt),
          systemPrompt: rewrite(node.systemPrompt),
        };
      }
      if (node.type === "merge") {
        return {
          ...node,
          ...(node.id === nodeId ? { key: nextKey } : {}),
          template: rewrite(node.template),
        };
      }
      return node;
    }),
  };
}

/**
 * A copy of a step next to it, fed by the same inputs, so it runs as a
 * parallel alternative (e.g. the same prompt on another model). Its output is
 * left for the user to connect.
 */
export function duplicateWorkflowStep(
  graph: WorkflowGraph,
  nodeId: string,
  position: WorkflowPosition,
): { graph: WorkflowGraph; node: WorkflowStepNode } | null {
  const source = graph.nodes.find((node) => node.id === nodeId);
  if (!source || !isStepNode(source) || graph.nodes.length >= WORKFLOW_MAX_NODES) return null;
  const name = `${source.name.slice(0, 75)} copy`;
  const node: WorkflowStepNode = {
    ...source,
    id: crypto.randomUUID(),
    position,
    name,
    key: createUniqueStepKey(name, graph),
  };
  const incoming = graph.edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => createWorkflowEdge(edge.source, node.id));
  return { node, graph: { nodes: [...graph.nodes, node], edges: [...graph.edges, ...incoming] } };
}
