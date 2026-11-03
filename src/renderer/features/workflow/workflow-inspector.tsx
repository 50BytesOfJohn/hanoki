import * as React from "react";
import type { Hotkey } from "@tanstack/react-hotkeys";
import { Cancel01Icon, Copy01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HotkeyKbd } from "@/features/chat/model-picker/model-picker-parts";
import {
  createMergeTemplate,
  createUniqueStepKey,
  getAncestorIds,
  getFailureMode,
  getLoopBody,
  getLoopEdge,
  getPassModels,
  getMainPath,
  getStepRetries,
  getTemplateReferences,
  getTextSource,
  getUnusedMergeInputs,
  isModelNode,
  isStepNode,
  renameStepKey,
  WORKFLOW_KEY_PATTERN,
  WORKFLOW_MAX_LOOPS,
  WORKFLOW_MAX_PASS_MODELS,
  WORKFLOW_MAX_RETRIES,
  WORKFLOW_MAX_TEXT_LENGTH,
  type WorkflowAiNode,
  type WorkflowDecisionNode,
  type WorkflowFailureMode,
  type WorkflowGraph,
  type WorkflowInputRole,
  type WorkflowLoopLimitMode,
  type WorkflowMergeNode,
  type WorkflowModelNode,
  type WorkflowModelRef,
  type WorkflowNode,
  type WorkflowStepNode,
} from "@shared/workflow/graph";
import { getInputTag, previewStepRequest } from "@shared/workflow/step-request";
import { cn } from "cn";

import type { UpdateWorkflowGraph, UpdateWorkflowGraphOptions } from "./workflow-graph-store";
import { WorkflowModelPicker } from "./workflow-model-picker";

/** In the editor there is no chat yet, so its model has no name. */
const CHAT_MODEL_PRESETS = [{ key: "chat", label: "Chat model", modelId: null }];

const INPUT_ROLE_DESCRIPTIONS = {
  natural:
    "With a prompt, the input is a text to work on, sent in tags with the prompt. Without one, the model continues it as its own words.",
  user: "Always a text to work on, e.g. a draft to review. With a prompt it is sent in tags before it.",
  assistant:
    "The model's own words, e.g. a draft to continue. With chat context on, the model may read it as one more of its replies.",
} satisfies Record<WorkflowInputRole, string>;

const FAILURE_MODE_DESCRIPTIONS = {
  stop: "An error or a reply with no text stops the whole run, including steps still writing.",
  continue:
    "The run goes on; the steps after this one get whatever it wrote, which may be nothing.",
} satisfies Record<WorkflowFailureMode, string>;

const LOOP_LIMIT_DESCRIPTIONS = {
  stop: "The run stops. The message keeps the last finished text, e.g. the last attempt.",
  continue: "The run goes on along the other branch with the last attempt.",
} satisfies Record<WorkflowLoopLimitMode, string>;

type UpdateNode = (
  patch: Partial<WorkflowAiNode> | Partial<WorkflowMergeNode> | Partial<WorkflowDecisionNode>,
  options?: UpdateWorkflowGraphOptions,
) => void;

export function WorkflowInspector({
  graph,
  node,
  updateGraph,
  onEditPause,
  onDuplicate,
  duplicateHotkey,
  onClose,
}: {
  graph: WorkflowGraph;
  node: WorkflowNode;
  updateGraph: UpdateWorkflowGraph;
  /** Ends the current typing burst, so the next edit is its own undo step. */
  onEditPause: () => void;
  onDuplicate?: () => void;
  duplicateHotkey: Hotkey;
  onClose: () => void;
}) {
  const updateNode = React.useCallback<UpdateNode>(
    (patch, options) =>
      updateGraph(
        (current) => ({
          ...current,
          // SAFETY: callers only pass fields of the node type they are editing.
          nodes: current.nodes.map((candidate) =>
            candidate.id === node.id ? ({ ...candidate, ...patch } as WorkflowNode) : candidate,
          ),
        }),
        options,
      ),
    [node.id, updateGraph],
  );

  return (
    <aside
      aria-label="Step settings"
      onBlur={onEditPause}
      className="absolute top-3 right-3 bottom-3 z-10 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-overlay shadow-2xl shadow-black/30"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-separator pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {isStepNode(node) ? node.name : node.type === "input" ? "Input" : "Output"}
        </span>
        {onDuplicate ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Duplicate step"
                  onClick={onDuplicate}
                >
                  <HugeiconsIcon icon={Copy01Icon} className="size-3.5!" />
                </Button>
              }
            />
            <TooltipContent className="flex items-center gap-2">
              Duplicate
              <HotkeyKbd hotkey={duplicateHotkey} />
            </TooltipContent>
          </Tooltip>
        ) : null}
        {isStepNode(node) ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete step"
            onClick={() => {
              updateGraph((current) => ({
                nodes: current.nodes.filter((candidate) => candidate.id !== node.id),
                edges: current.edges.filter(
                  (edge) => edge.source !== node.id && edge.target !== node.id,
                ),
              }));
              onClose();
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5!" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label="Close step settings"
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5!" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-3">
          {node.type === "input" ? (
            <InspectorNote>
              The message you send enters here. Connect it to the steps that should start the
              workflow.
            </InspectorNote>
          ) : node.type === "output" ? (
            <InspectorNote>
              What reaches Output becomes the chat message. If a run is stopped or a step fails, the
              message uses the last finished step on the way here.
            </InspectorNote>
          ) : (
            <StepFields
              graph={graph}
              node={node}
              updateGraph={updateGraph}
              updateNode={updateNode}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function StepFields({
  graph,
  node,
  updateGraph,
  updateNode,
}: {
  graph: WorkflowGraph;
  node: WorkflowStepNode;
  updateGraph: UpdateWorkflowGraph;
  updateNode: UpdateNode;
}) {
  const id = React.useId();
  const promptRef = React.useRef<HTMLTextAreaElement>(null);
  const variables = React.useMemo(() => {
    const ancestors = getAncestorIds(graph, node.id);
    return graph.nodes.filter(
      (candidate): candidate is WorkflowStepNode =>
        isStepNode(candidate) && ancestors.has(candidate.id),
    );
  }, [graph, node.id]);
  const template = node.type === "merge" ? node.template : node.prompt;
  const unknownReferences = getTemplateReferences(
    node.type === "merge" ? node.template : `${node.prompt}\n${node.systemPrompt}`,
  ).filter((key) => !variables.some((variable) => variable.key === key));
  const isMainPathMerge =
    node.type === "merge" && getMainPath(graph).some((candidate) => candidate.id === node.id);
  const unusedInputs = node.type === "merge" ? getUnusedMergeInputs(graph, node) : [];
  const inputTag = React.useMemo(
    () => getInputTag(getTextSource(graph, node.id)),
    [graph, node.id],
  );

  const insertVariable = (token: string) => {
    const element = promptRef.current;
    const start = element?.selectionStart ?? template.length;
    const end = element?.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    updateNode(node.type === "merge" ? { template: next } : { prompt: next });
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <>
      <InspectorField
        label="Name"
        htmlFor={`${id}-name`}
        description={
          node.name.trim() ? undefined : "Give the step a name; until then edits aren't saved."
        }
        invalid={!node.name.trim()}
      >
        <Input
          id={`${id}-name`}
          className="h-7 text-[13px]"
          aria-invalid={!node.name.trim()}
          value={node.name}
          maxLength={80}
          onChange={(event) => {
            const name = event.target.value;
            // A key that still follows the name keeps following it.
            const followsName = node.key === createUniqueStepKey(node.name, graph, node.id);
            updateGraph(
              (current) => {
                const renamed = {
                  ...current,
                  nodes: current.nodes.map((candidate) =>
                    candidate.id === node.id ? { ...candidate, name } : candidate,
                  ),
                };
                return followsName && name.trim()
                  ? renameStepKey(renamed, node.id, createUniqueStepKey(name, current, node.id))
                  : renamed;
              },
              { coalesceKey: `${node.id}:name` },
            );
          }}
        />
      </InspectorField>

      <StepKeyField graph={graph} node={node} updateGraph={updateGraph} />

      {isModelNode(node) ? (
        <>
          <InspectorField label="Model">
            <WorkflowModelPicker
              value={node.model}
              presets={CHAT_MODEL_PRESETS}
              activePresetKey={node.model ? null : "chat"}
              onSelectPreset={() => updateNode({ model: null })}
              onSelectModel={(model) => updateNode({ model })}
              className="-mx-2 w-[calc(100%+1rem)]"
            />
          </InspectorField>

          {node.type === "ai" ? (
            <PassModelsField graph={graph} node={node} updateNode={updateNode} />
          ) : null}

          <SwitchRow
            label="Include chat context"
            description={
              node.type === "decision"
                ? "On: the question is asked with the conversation and the chat's instructions before the input. Off: only the input. Off is cheaper and usually enough."
                : "On: the step sees the conversation and the chat's instructions, like a normal reply, then its input. Off: only its input."
            }
            checked={node.includeContext}
            onCheckedChange={(includeContext) => updateNode({ includeContext })}
          />
        </>
      ) : null}

      {node.type === "ai" ? (
        <>
          <InspectorField label="Send input as" description={INPUT_ROLE_DESCRIPTIONS[node.role]}>
            <ToggleGroup
              size="sm"
              variant="outline"
              spacing={0}
              value={[node.role]}
              onValueChange={(value: string[]) => {
                const role = value[0];
                if (role === "natural" || role === "user" || role === "assistant") {
                  updateNode({ role });
                }
              }}
            >
              <ToggleGroupItem value="natural" className="h-7 px-3 text-xs">
                Natural
              </ToggleGroupItem>
              <ToggleGroupItem value="user" className="h-7 px-3 text-xs">
                User
              </ToggleGroupItem>
              <ToggleGroupItem value="assistant" className="h-7 px-3 text-xs">
                Assistant
              </ToggleGroupItem>
            </ToggleGroup>
          </InspectorField>
        </>
      ) : null}

      {isModelNode(node) ? (
        <>
          <InspectorField label="System prompt" htmlFor={`${id}-system`}>
            <Textarea
              id={`${id}-system`}
              className="max-h-60 min-h-14 text-[13px]"
              placeholder="Optional instructions for this step"
              maxLength={WORKFLOW_MAX_TEXT_LENGTH}
              value={node.systemPrompt}
              onChange={(event) =>
                updateNode(
                  { systemPrompt: event.target.value },
                  { coalesceKey: `${node.id}:systemPrompt` },
                )
              }
            />
          </InspectorField>
        </>
      ) : null}

      <InspectorField
        label={node.type === "ai" ? "Prompt" : node.type === "decision" ? "Question" : "Template"}
        htmlFor={`${id}-prompt`}
        description={
          node.type === "ai"
            ? `Sent after the input, which arrives in <${inputTag}> tags. Use {{input}} to place it yourself instead.`
            : node.type === "decision"
              ? `A yes/no question about the input, which arrives in <${inputTag}> tags. The Decision hands its input on unchanged along the branch it answers.`
              : isMainPathMerge
                ? "Empty joins the inputs in connection order. The first step it uses is the main path when a run stops early."
                : "Empty joins the inputs in connection order."
        }
        invalid={node.type === "decision" && !node.disabled && !node.prompt.trim()}
      >
        <Textarea
          ref={promptRef}
          id={`${id}-prompt`}
          className="max-h-80 min-h-20 font-mono text-xs leading-relaxed"
          placeholder={
            node.type === "ai"
              ? "What should this step do?"
              : node.type === "decision"
                ? `Did the text in the <${inputTag}> tags refuse the request instead of doing it?`
                : "{{step.draft}}\n\n{{step.review}}"
          }
          maxLength={WORKFLOW_MAX_TEXT_LENGTH}
          value={template}
          onChange={(event) =>
            updateNode(
              node.type === "merge"
                ? { template: event.target.value }
                : { prompt: event.target.value },
              { coalesceKey: `${node.id}:prompt` },
            )
          }
        />
        <div className="flex flex-wrap gap-1">
          {["input", ...variables.map((variable) => `step.${variable.key}`)].map((token) => (
            <button
              key={token}
              type="button"
              className="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors duration-100 hover:bg-surface-tertiary hover:text-foreground"
              onClick={() => insertVariable(`{{${token}}}`)}
            >
              {`{{${token}}}`}
            </button>
          ))}
        </div>
        {unknownReferences.length > 0 ? (
          <p className="text-xs text-warning">
            {unknownReferences.map((key) => `{{step.${key}}}`).join(", ")}{" "}
            {unknownReferences.length === 1 ? "isn't a step" : "aren't steps"} that run before this
            one, so {unknownReferences.length === 1 ? "it stays" : "they stay"} empty.
          </p>
        ) : null}
        {unusedInputs.length > 0 ? (
          <div className="flex flex-col items-start gap-1.5">
            <p className="text-xs text-warning">
              Doesn't use {unusedInputs.map((source) => `“${source.name}”`).join(" and ")}, though{" "}
              {unusedInputs.length === 1 ? "it is" : "they are"} connected, so{" "}
              {unusedInputs.length === 1 ? "its" : "their"} output is dropped.
            </p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => updateNode({ template: createMergeTemplate(graph, node.id) })}
            >
              Use the connected steps
            </Button>
          </div>
        ) : null}
      </InspectorField>

      {isModelNode(node) ? <RequestPreview graph={graph} nodeId={node.id} /> : null}

      {node.type === "decision" ? (
        <LoopFields graph={graph} node={node} updateNode={updateNode} />
      ) : null}

      {isModelNode(node) ? <RetriesField node={node} updateNode={updateNode} /> : null}

      {node.type === "ai" ? (
        <InspectorField
          label="If this step fails"
          description={FAILURE_MODE_DESCRIPTIONS[getFailureMode(node)]}
        >
          <ToggleGroup
            size="sm"
            variant="outline"
            spacing={0}
            value={[getFailureMode(node)]}
            onValueChange={(value: string[]) => {
              const mode = value[0];
              if (mode === "stop" || mode === "continue") updateNode({ onFailure: mode });
            }}
          >
            <ToggleGroupItem value="stop" className="h-7 px-3 text-xs">
              Stop workflow
            </ToggleGroupItem>
            <ToggleGroupItem value="continue" className="h-7 px-3 text-xs">
              Continue
            </ToggleGroupItem>
          </ToggleGroup>
        </InspectorField>
      ) : null}

      <SwitchRow
        label="Disabled"
        description={
          node.type === "decision"
            ? "A disabled Decision asks nothing and goes on along the branch that doesn't loop, else No."
            : "A disabled step passes its input through unchanged."
        }
        checked={node.disabled}
        onCheckedChange={(disabled) => updateNode({ disabled })}
      />
    </>
  );
}

function LoopFields({
  graph,
  node,
  updateNode,
}: {
  graph: WorkflowGraph;
  node: WorkflowDecisionNode;
  updateNode: UpdateNode;
}) {
  const id = React.useId();
  const loopEdge = getLoopEdge(graph, node.id);
  if (!loopEdge) {
    return (
      <InspectorNote>
        To loop, connect Yes or No back to a step before this one: taking that branch runs the steps
        from there again, e.g. to retry a reply the model refused.
      </InspectorNote>
    );
  }
  const target = graph.nodes.find((candidate) => candidate.id === loopEdge.target);
  const branch = loopEdge.sourceHandle === "true" ? "Yes" : "No";
  return (
    <>
      <InspectorField
        label="Max loops"
        htmlFor={`${id}-loops`}
        description={`${branch} goes back to “${target && isStepNode(target) ? target.name : "an earlier step"}” at most ${node.maxLoops} ${
          node.maxLoops === 1 ? "time" : "times"
        }, so those steps run up to ${node.maxLoops + 1} times.`}
      >
        <NumberInput
          id={`${id}-loops`}
          value={node.maxLoops}
          min={1}
          max={WORKFLOW_MAX_LOOPS}
          onChange={(maxLoops) => updateNode({ maxLoops })}
        />
      </InspectorField>
      <InspectorField
        label={`If it's still ${branch}`}
        description={LOOP_LIMIT_DESCRIPTIONS[node.onLoopLimit]}
      >
        <ToggleGroup
          size="sm"
          variant="outline"
          spacing={0}
          value={[node.onLoopLimit]}
          onValueChange={(value: string[]) => {
            const mode = value[0];
            if (mode === "stop" || mode === "continue") updateNode({ onLoopLimit: mode });
          }}
        >
          <ToggleGroupItem value="stop" className="h-7 px-3 text-xs">
            Stop workflow
          </ToggleGroupItem>
          <ToggleGroupItem value="continue" className="h-7 px-3 text-xs">
            Take {branch === "Yes" ? "No" : "Yes"}
          </ToggleGroupItem>
        </ToggleGroup>
      </InspectorField>
    </>
  );
}

/**
 * The models a loop's later passes run this step with, e.g. other models to
 * try when the first one refused.
 */
function PassModelsField({
  graph,
  node,
  updateNode,
}: {
  graph: WorkflowGraph;
  node: WorkflowAiNode;
  updateNode: UpdateNode;
}) {
  const passModels = getPassModels(node);
  const inLoop = graph.edges.some((edge) => edge.loop && getLoopBody(graph, edge).has(node.id));
  const setPassModels = (next: WorkflowModelRef[]) =>
    updateNode({ passModels: next.length > 0 ? next : undefined });
  return (
    <InspectorField
      label="Models on later passes"
      description={
        !inLoop
          ? "Used when a Decision's loop runs this step again. This step isn't in a loop yet."
          : passModels.length === 0
            ? "Each pass a loop runs uses the model above. Add models to switch on each pass, e.g. to try another model after a refusal."
            : `Pass ${passModels.length + 2} starts over with the model above.`
      }
    >
      <ol className="-mx-2 flex flex-col">
        {passModels.map((model, index) => (
          <li key={index} className="flex min-w-0 items-center gap-1">
            <span className="w-12 shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
              Pass {index + 2}
            </span>
            <WorkflowModelPicker
              value={model}
              presets={[]}
              activePresetKey={null}
              onSelectPreset={() => {}}
              onSelectModel={(next) =>
                setPassModels(passModels.map((current, at) => (at === index ? next : current)))
              }
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove the model for pass ${index + 2}`}
              onClick={() => setPassModels(passModels.filter((_, at) => at !== index))}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </li>
        ))}
        {passModels.length < WORKFLOW_MAX_PASS_MODELS ? (
          <li className="flex min-w-0 items-center gap-1">
            <span className="w-12 shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
              Pass {passModels.length + 2}
            </span>
            <WorkflowModelPicker
              value={null}
              presets={[]}
              activePresetKey={null}
              onSelectPreset={() => {}}
              onSelectModel={(next) => setPassModels([...passModels, next])}
              placeholder={passModels.length === 0 ? "Same model" : "Add model"}
              className="min-w-0 flex-1"
            />
          </li>
        ) : null}
      </ol>
    </InspectorField>
  );
}

function RetriesField({ node, updateNode }: { node: WorkflowModelNode; updateNode: UpdateNode }) {
  const id = React.useId();
  const retries = getStepRetries(node);
  return (
    <InspectorField
      label="Retries"
      htmlFor={`${id}-retries`}
      description={
        node.type === "decision"
          ? "Asks again after an error or an answer that isn't yes or no."
          : "Tries again after an error or a reply with no text, before the step fails. Busy providers are always waited out."
      }
    >
      <NumberInput
        id={`${id}-retries`}
        value={retries}
        min={0}
        max={WORKFLOW_MAX_RETRIES}
        onChange={(next) => updateNode({ retries: next })}
      />
    </InspectorField>
  );
}

/** A whole number kept in range; empty or invalid text leaves the value as it was. */
function NumberInput({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  const [synced, setSynced] = React.useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(String(value));
  }
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      className="h-7 w-20 text-[13px]"
      min={min}
      max={max}
      step={1}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = Number(event.target.value);
        if (event.target.value.trim() && Number.isInteger(next) && next >= min && next <= max) {
          onChange(next);
        }
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

function StepKeyField({
  graph,
  node,
  updateGraph,
}: {
  graph: WorkflowGraph;
  node: WorkflowStepNode;
  updateGraph: UpdateWorkflowGraph;
}) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(node.key);
  const [editingKey, setEditingKey] = React.useState(node.key);
  // A key changed elsewhere (e.g. by renaming the step) replaces the draft.
  if (editingKey !== node.key) {
    setEditingKey(node.key);
    setDraft(node.key);
  }
  const taken = graph.nodes.some(
    (candidate) => isStepNode(candidate) && candidate.id !== node.id && candidate.key === draft,
  );
  const error = !WORKFLOW_KEY_PATTERN.test(draft)
    ? "Lowercase letters, digits and _ only."
    : taken
      ? "Another step uses this key."
      : null;

  return (
    <InspectorField
      label="Key"
      htmlFor={`${id}-key`}
      description={error ?? `Other steps read this output as {{step.${node.key}}}.`}
      invalid={error !== null}
    >
      <Input
        id={`${id}-key`}
        className="h-7 font-mono text-xs"
        aria-invalid={error !== null}
        value={draft}
        maxLength={40}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (
            WORKFLOW_KEY_PATTERN.test(next) &&
            !graph.nodes.some(
              (candidate) =>
                isStepNode(candidate) && candidate.id !== node.id && candidate.key === next,
            )
          ) {
            updateGraph((current) => renameStepKey(current, node.id, next), {
              coalesceKey: `${node.id}:key`,
            });
          }
        }}
        onBlur={() => setDraft(node.key)}
      />
    </InspectorField>
  );
}

function InspectorField({
  label,
  htmlFor,
  description,
  invalid = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase"
      >
        {label}
      </Label>
      {children}
      {description ? (
        <p
          className={cn(
            "text-xs leading-snug",
            invalid ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </Label>
        <p className="text-xs leading-snug text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} className="mt-0.5" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InspectorNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

/** What the step sends, with placeholders for what only a run knows. */
function RequestPreview({ graph, nodeId }: { graph: WorkflowGraph; nodeId: string }) {
  const [open, setOpen] = React.useState(false);
  const request = React.useMemo(
    () => (open ? previewStepRequest(graph, nodeId) : null),
    [graph, nodeId, open],
  );
  const turns = request
    ? [
        ...(request.system ? [{ role: "system", text: request.system }] : []),
        ...request.messages.map((message) => ({
          role: message.role,
          text:
            typeof message.content === "string"
              ? message.content
              : message.content.map((part) => ("text" in part ? part.text : "")).join(""),
        })),
      ]
    : [];

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        className="self-start text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase transition-colors duration-100 hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide what it sends" : "Show what it sends"}
      </button>
      {open ? (
        request ? (
          <ol className="flex flex-col gap-1.5">
            {turns.map((turn, index) => (
              <li key={index} className="rounded-md bg-hover px-2 py-1.5">
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  {turn.role}
                </span>
                <p className="max-h-40 overflow-y-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {turn.text}
                </p>
              </li>
            ))}
            {request.prefix ? (
              <li className="text-xs text-muted-foreground">
                The model continues the last assistant turn.
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-xs text-warning">
            Nothing to send: give the step an input, a prompt or chat context.
          </p>
        )
      ) : null}
    </div>
  );
}
