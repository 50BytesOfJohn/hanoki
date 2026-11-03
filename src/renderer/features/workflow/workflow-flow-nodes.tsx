import * as React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  useInternalNode,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AiMagicIcon,
  Alert02Icon,
  GitBranchIcon,
  Login03Icon,
  Logout03Icon,
  MergeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getPassModels,
  getStepRetries,
  type WorkflowDecisionNode,
  type WorkflowInputNode,
  type WorkflowOutputNode,
  type WorkflowStepNode,
} from "@shared/workflow/graph";
import { cn } from "cn";

import { formatInputRole, formatPassModels, formatRetries } from "./workflow-labels";
import { WorkflowModelName } from "./workflow-model-picker";

export type StepFlowNode = Node<
  {
    node: WorkflowStepNode;
    warning: string | null;
    /** For a Decision: the branch that loops back, if one does. */
    loopBranch?: "true" | "false" | null;
  },
  "workflowStep"
>;
export type EndpointFlowNode = Node<
  { node: WorkflowInputNode | WorkflowOutputNode },
  "workflowEndpoint"
>;
export type WorkflowFlowNode = StepFlowNode | EndpointFlowNode;

const HANDLE_CLASS =
  "!size-2.5 !rounded-full !border-2 !border-surface !bg-muted-foreground/70 transition-colors hover:!bg-primary";

export const StepNodeView = React.memo(function StepNodeView({
  data,
  selected,
}: NodeProps<StepFlowNode>) {
  const { node, warning } = data;
  const icon =
    node.type === "ai" ? AiMagicIcon : node.type === "decision" ? GitBranchIcon : MergeIcon;

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-surface-secondary text-[13px] shadow-lg shadow-black/20 transition-[border-color,opacity] duration-100",
        selected ? "border-focus/70" : "border-border",
        node.disabled && "opacity-55",
      )}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <HugeiconsIcon icon={icon} className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={cn("min-w-0 flex-1 truncate font-medium", node.disabled && "line-through")}
        >
          {node.name}
        </span>
        {warning ? (
          <Tooltip>
            <TooltipTrigger
              render={<span className="flex shrink-0 text-warning" aria-label={warning} />}
            >
              <HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{warning}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 px-3 pt-1 pb-2.5 text-xs text-muted-foreground">
        {node.type === "ai" ? (
          <>
            {node.model ? (
              <WorkflowModelName modelId={node.model.modelId} flagUnavailable />
            ) : (
              <span className="truncate">Chat model</span>
            )}
            <span className="flex flex-wrap gap-1">
              <NodeChip>{node.includeContext ? "Chat context" : "No context"}</NodeChip>
              <NodeChip>{formatInputRole(node.role)}</NodeChip>
              {getPassModels(node).length > 0 ? (
                <NodeChip>{formatPassModels(getPassModels(node).length)}</NodeChip>
              ) : null}
              {getStepRetries(node) > 0 ? (
                <NodeChip>{formatRetries(getStepRetries(node))}</NodeChip>
              ) : null}
              {node.disabled ? <NodeChip>Disabled</NodeChip> : null}
            </span>
          </>
        ) : node.type === "decision" ? (
          <DecisionBody node={node} loopBranch={data.loopBranch ?? null} />
        ) : (
          <>
            <span className="truncate font-mono text-[11px]">
              {node.template.trim() ? node.template.replace(/\s+/g, " ") : "Joins inputs in order"}
            </span>
            {node.disabled ? (
              <span className="flex">
                <NodeChip>Disabled</NodeChip>
              </span>
            ) : null}
          </>
        )}
      </div>
      {node.type === "decision" ? null : (
        <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
      )}
    </div>
  );
});

function DecisionBody({
  node,
  loopBranch,
}: {
  node: WorkflowDecisionNode;
  loopBranch: "true" | "false" | null;
}) {
  return (
    <>
      {node.model ? (
        <WorkflowModelName modelId={node.model.modelId} flagUnavailable />
      ) : (
        <span className="truncate">Chat model</span>
      )}
      <span className={cn("line-clamp-2 text-[11px] leading-4", !node.prompt.trim() && "italic")}>
        {node.prompt.trim() || "No question yet"}
      </span>
      <span className="flex flex-wrap gap-1">
        {loopBranch ? <NodeChip>Loops up to {node.maxLoops}×</NodeChip> : null}
        {node.includeContext ? <NodeChip>Chat context</NodeChip> : null}
        {getStepRetries(node) > 0 ? (
          <NodeChip>{formatRetries(getStepRetries(node))}</NodeChip>
        ) : null}
        {node.disabled ? <NodeChip>Disabled</NodeChip> : null}
      </span>
      {/* Yes and No leave from their own handles, labelled where they leave. */}
      <span className="-mr-3 flex flex-col items-end gap-1 pt-1">
        <BranchHandle branch="true" loops={loopBranch === "true"} />
        <BranchHandle branch="false" loops={loopBranch === "false"} />
      </span>
    </>
  );
}

function BranchHandle({ branch, loops }: { branch: "true" | "false"; loops: boolean }) {
  return (
    <span className="relative flex h-4 items-center pr-3 text-[11px] font-medium text-foreground/70">
      {branch === "true" ? "Yes" : "No"}
      {loops ? <span className="ml-1 font-normal text-muted-foreground">· loops</span> : null}
      <Handle
        id={branch}
        type="source"
        position={Position.Right}
        className={cn(HANDLE_CLASS, branch === "true" ? "!bg-success/80" : "!bg-destructive/70")}
      />
    </span>
  );
}

export const EndpointNodeView = React.memo(function EndpointNodeView({
  data,
  selected,
}: NodeProps<EndpointFlowNode>) {
  const isInput = data.node.type === "input";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-[13px] shadow-lg shadow-black/20 transition-colors duration-100",
        selected ? "border-focus/70" : "border-border",
      )}
    >
      {isInput ? null : <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />}
      <HugeiconsIcon
        icon={isInput ? Login03Icon : Logout03Icon}
        className="size-3.5 text-muted-foreground"
      />
      <span className="font-medium">{isInput ? "Input" : "Output"}</span>
      <span className="text-xs text-muted-foreground">
        {isInput ? "the message" : "becomes the reply"}
      </span>
      {isInput ? <Handle type="source" position={Position.Right} className={HANDLE_CLASS} /> : null}
    </div>
  );
});

function NodeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-hover px-1.5 py-px text-[11px] leading-4 text-muted-foreground">
      {children}
    </span>
  );
}

export const WORKFLOW_NODE_TYPES = {
  workflowStep: StepNodeView,
  workflowEndpoint: EndpointNodeView,
};

const LOOP_GAP = 28;
const LOOP_RADIUS = 10;

/**
 * A loop runs back against the flow. Drawn straight, it would cut through the
 * steps between; this one leaves the branch, drops below both ends, runs back
 * and rises into the earlier step.
 */
export const LoopEdgeView = React.memo(function LoopEdgeView({
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  markerEnd,
  style,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const bottom = Math.max(
    sourceY,
    targetY,
    ...[sourceNode, targetNode].map((node) =>
      node ? node.internals.positionAbsolute.y + (node.measured.height ?? 0) : 0,
    ),
  );
  const below = bottom + LOOP_GAP;
  const right = sourceX + LOOP_GAP / 2;
  const left = targetX - LOOP_GAP / 2;
  const r = LOOP_RADIUS;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `H ${right - r} Q ${right} ${sourceY} ${right} ${sourceY + r}`,
    `V ${below - r} Q ${right} ${below} ${right - r} ${below}`,
    `H ${left + r} Q ${left} ${below} ${left} ${below - r}`,
    `V ${targetY + r} Q ${left} ${targetY} ${left + r} ${targetY}`,
    `H ${targetX}`,
  ].join(" ");
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} interactionWidth={16} />
      {label ? (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan pointer-events-none absolute rounded bg-surface px-1.5 py-px text-[11px] text-muted-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${(left + right) / 2}px, ${below}px)`,
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

export const WORKFLOW_EDGE_TYPES = { workflowLoop: LoopEdgeView };
