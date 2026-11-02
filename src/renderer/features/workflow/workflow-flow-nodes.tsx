import * as React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  AiMagicIcon,
  Alert02Icon,
  Login03Icon,
  Logout03Icon,
  MergeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  WorkflowInputNode,
  WorkflowOutputNode,
  WorkflowStepNode,
} from "@shared/workflow/graph";
import { cn } from "cn";

import { formatInputRole } from "./workflow-labels";
import { WorkflowModelName } from "./workflow-model-picker";

export type StepFlowNode = Node<{ node: WorkflowStepNode; warning: string | null }, "workflowStep">;
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
        <HugeiconsIcon
          icon={node.type === "ai" ? AiMagicIcon : MergeIcon}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
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
              {node.disabled ? <NodeChip>Disabled</NodeChip> : null}
            </span>
          </>
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
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  );
});

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
