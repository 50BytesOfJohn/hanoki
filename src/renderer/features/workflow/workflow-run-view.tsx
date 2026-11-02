import * as React from "react";
import { Streamdown } from "streamdown";
import {
  AiMagicIcon,
  Alert02Icon,
  Clock01Icon,
  FlowConnectionIcon,
  MergeIcon,
  RepeatIcon,
  StopCircleIcon,
  Tick02Icon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { useChatRerunWorkflowFrom, useChatApplyWorkflowStep } from "@/features/chat/chat-context";
import { useChatScrollToBottom } from "@/features/chat/chat-scroll-context";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { getMainPath, getOrderedSteps, type WorkflowStepNode } from "@shared/workflow/graph";
import {
  getWorkflowRun,
  getWorkflowSteps,
  type WorkflowRunState,
  type WorkflowStepState,
} from "@shared/workflow/run";

import { WorkflowModelName } from "./workflow-model-picker";

/**
 * The text a running workflow is writing into the message: the step that
 * feeds Output streams in place of the reply until the run settles it.
 */
export function getStreamingWorkflowText(message: HanokiUiMessage): string | null {
  const run = getWorkflowRun(message);
  if (run?.status !== "running") return null;
  const source = getMainPath(run.graph)[1];
  const state = source ? getWorkflowSteps(message).get(source.id) : undefined;
  return state && state.output.length > 0 ? state.output : null;
}

/** A workflow's steps on its message, one collapsed row each, like tool calls. */
export const WorkflowRunTrace = React.memo(function WorkflowRunTrace({
  message,
  isInteractionLocked,
}: {
  message: HanokiUiMessage;
  isInteractionLocked: boolean;
}) {
  const run = getWorkflowRun(message);
  if (!run) return null;
  const steps = getWorkflowSteps(message);
  const nodes = getOrderedSteps(run.graph);
  const isRunning = run.status === "running";
  const rerunNode = run.rerunFrom
    ? nodes.find((node) => node.id === run.rerunFrom?.nodeId)
    : undefined;

  return (
    <Trace className="my-2 first:mt-0 last:mb-3">
      <TraceLine className="text-xs">
        <TraceIcon>
          <HugeiconsIcon icon={FlowConnectionIcon} />
        </TraceIcon>
        <TraceTitle className="font-medium text-foreground/80">{run.name}</TraceTitle>
        <TraceDescription>
          {[
            rerunNode ? `rerun from ${rerunNode.name}` : null,
            run.status === "stopped" ? "stopped" : run.status === "error" ? "didn't finish" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </TraceDescription>
      </TraceLine>
      {nodes.map((node) => (
        <WorkflowStepRow
          key={node.id}
          messageId={message.id}
          node={node}
          state={steps.get(node.id)}
          run={run}
          canAct={!isRunning && !isInteractionLocked}
        />
      ))}
    </Trace>
  );
});

const WorkflowStepRow = React.memo(function WorkflowStepRow({
  messageId,
  node,
  state,
  run,
  canAct,
}: {
  messageId: string;
  node: WorkflowStepNode;
  state: WorkflowStepState | undefined;
  run: WorkflowRunState;
  canAct: boolean;
}) {
  const rerunFrom = useChatRerunWorkflowFrom();
  const applyStep = useChatApplyWorkflowStep();
  const scrollToBottom = useChatScrollToBottom();
  const modelId = state?.modelId ?? (node.type === "ai" ? node.model?.modelId : undefined);
  const status = state?.status ?? "pending";
  const output = state?.output ?? "";
  const isActive = status === "running" || status === "waiting";
  const isMessage = run.outputNodeId === node.id && run.status !== "running";

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine
          status={
            isActive
              ? "running"
              : status === "error"
                ? "error"
                : status === "pending"
                  ? "pending"
                  : undefined
          }
        >
          <TraceIcon>
            <StepStatusIcon node={node} status={status} />
          </TraceIcon>
          <TraceTitle>{node.name}</TraceTitle>
          <TraceDescription className="flex min-w-0 shrink items-center gap-1.5 truncate">
            <StepDescription node={node} state={state} modelId={modelId} isMessage={isMessage} />
          </TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="group/step flex flex-col gap-2">
        {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
        {output ? (
          <Streamdown
            mode={isActive ? "streaming" : "static"}
            isAnimating={isActive}
            className="text-[13px] leading-relaxed text-muted-foreground"
          >
            {output}
          </Streamdown>
        ) : !state?.error ? (
          <p className="text-xs">{status === "pending" ? "Not run." : "No output yet."}</p>
        ) : null}
        {canAct ? (
          // Row actions show on hover (or keyboard focus), so the output reads first.
          <div className="-ml-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/step:opacity-100 focus-within:opacity-100">
            {output.trim() && !isMessage ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => void applyStep(messageId, node.id)}
              >
                <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
                Use as message
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                scrollToBottom();
                void rerunFrom(messageId, node.id);
              }}
            >
              <HugeiconsIcon icon={RepeatIcon} data-icon="inline-start" />
              Rerun from here
            </Button>
          </div>
        ) : null}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
});

function StepStatusIcon({
  node,
  status,
}: {
  node: WorkflowStepNode;
  status: WorkflowStepState["status"];
}) {
  if (status === "running") return <Spinner />;
  const icon =
    status === "waiting"
      ? Clock01Icon
      : status === "error"
        ? Alert02Icon
        : status === "stopped"
          ? StopCircleIcon
          : status === "skipped"
            ? ViewOffSlashIcon
            : node.type === "merge"
              ? MergeIcon
              : AiMagicIcon;
  return <HugeiconsIcon icon={icon} />;
}

function StepDescription({
  node,
  state,
  modelId,
  isMessage,
}: {
  node: WorkflowStepNode;
  state: WorkflowStepState | undefined;
  modelId: string | undefined;
  isMessage: boolean;
}) {
  const parts: string[] = [];
  if (state?.status === "skipped") parts.push("disabled");
  if (state?.status === "stopped") parts.push(state.partial ? "stopped · partial" : "stopped");
  if (state?.status === "error") parts.push(state.partial ? "failed · partial" : "failed");
  if (state?.reused) parts.push("kept");
  else if (state?.status === "done" && state.startedAt && state.endedAt && node.type === "ai") {
    parts.push(formatDuration(state.endedAt - state.startedAt));
  }

  return (
    <>
      {node.type === "ai" && modelId ? (
        <WorkflowModelName modelId={modelId} className="shrink" />
      ) : null}
      {parts.length > 0 ? (
        <span className="truncate">
          {node.type === "ai" && modelId ? "· " : ""}
          {parts.join(" · ")}
        </span>
      ) : null}
      {state?.status === "waiting" && state.retry ? <RetryCountdown retry={state.retry} /> : null}
      {isMessage ? <span className="shrink-0 text-foreground/70">· in message</span> : null}
    </>
  );
}

function RetryCountdown({ retry }: { retry: NonNullable<WorkflowStepState["retry"]> }) {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const seconds = Math.max(0, Math.ceil((retry.retryAt - now) / 1000));
  return (
    <span className="shrink-0">
      · provider busy, retrying{seconds > 0 ? ` in ${seconds}s` : "…"}
    </span>
  );
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
