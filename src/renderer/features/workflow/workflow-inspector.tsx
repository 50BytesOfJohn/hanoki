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
  createUniqueStepKey,
  getAncestorIds,
  getMainPath,
  getTemplateReferences,
  isStepNode,
  renameStepKey,
  WORKFLOW_KEY_PATTERN,
  WORKFLOW_MAX_TEXT_LENGTH,
  type WorkflowAiNode,
  type WorkflowGraph,
  type WorkflowInputRole,
  type WorkflowMergeNode,
  type WorkflowNode,
  type WorkflowStepNode,
} from "@shared/workflow/graph";
import { cn } from "cn";

import type { UpdateWorkflowGraph, UpdateWorkflowGraphOptions } from "./workflow-graph-store";
import { WorkflowModelPicker } from "./workflow-model-picker";

/** In the editor there is no chat yet, so its model has no name. */
const CHAT_MODEL_PRESETS = [{ key: "chat", label: "Chat model", modelId: null }];

const INPUT_ROLE_DESCRIPTIONS = {
  natural:
    "Whichever role keeps turns alternating after what comes before, so models that reject two user or two assistant turns in a row still work.",
  user: "A text to work on, e.g. a draft to review.",
  assistant: "The model's own words, e.g. a draft to continue or rewrite.",
} satisfies Record<WorkflowInputRole, string>;

type UpdateNode = (
  patch: Partial<WorkflowAiNode> | Partial<WorkflowMergeNode>,
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
              What reaches Output becomes the chat message. If a run is stopped, the message uses
              the last finished step on the way here.
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
  const template = node.type === "ai" ? node.prompt : node.template;
  const unknownReferences = getTemplateReferences(
    node.type === "ai" ? `${node.prompt}\n${node.systemPrompt}` : node.template,
  ).filter((key) => !variables.some((variable) => variable.key === key));
  const isMainPathMerge =
    node.type === "merge" && getMainPath(graph).some((candidate) => candidate.id === node.id);

  const insertVariable = (token: string) => {
    const element = promptRef.current;
    const start = element?.selectionStart ?? template.length;
    const end = element?.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    updateNode(node.type === "ai" ? { prompt: next } : { template: next });
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

      {node.type === "ai" ? (
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

          <SwitchRow
            label="Include chat context"
            description="On: the step sees the conversation and the chat's instructions, like a normal reply, then its input. Off: only its input."
            checked={node.includeContext}
            onCheckedChange={(includeContext) => updateNode({ includeContext })}
          />

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
        label={node.type === "ai" ? "Prompt" : "Template"}
        htmlFor={`${id}-prompt`}
        description={
          node.type === "ai"
            ? "Sent after the input. Use {{input}} to place the input yourself instead."
            : isMainPathMerge
              ? "Empty joins the inputs in connection order. The first step it uses is the main path when a run stops early."
              : "Empty joins the inputs in connection order."
        }
      >
        <Textarea
          ref={promptRef}
          id={`${id}-prompt`}
          className="max-h-80 min-h-20 font-mono text-xs leading-relaxed"
          placeholder={
            node.type === "ai" ? "What should this step do?" : "{{step.draft}}\n\n{{step.review}}"
          }
          maxLength={WORKFLOW_MAX_TEXT_LENGTH}
          value={template}
          onChange={(event) =>
            updateNode(
              node.type === "ai"
                ? { prompt: event.target.value }
                : { template: event.target.value },
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
      </InspectorField>

      <SwitchRow
        label="Disabled"
        description="A disabled step passes its input through unchanged."
        checked={node.disabled}
        onCheckedChange={(disabled) => updateNode({ disabled })}
      />
    </>
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
