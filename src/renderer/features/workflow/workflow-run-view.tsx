import * as React from "react";
import { Streamdown } from "streamdown";
import {
  AiMagicIcon,
  Alert02Icon,
  ArrowUp01Icon,
  Clock01Icon,
  FlowConnectionIcon,
  GitBranchIcon,
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
  collapseTrace,
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
import {
  getOrderedSteps,
  getOutputWriter,
  getStepRetries,
  isModelNode,
  type WorkflowStepNode,
} from "@shared/workflow/graph";
import {
  getWorkflowRun,
  getWorkflowStepHistory,
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
  const source = getOutputWriter(run.graph);
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
  const history = getWorkflowStepHistory(message);
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
          earlier={history.get(node.id)}
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
  earlier,
  run,
  canAct,
}: {
  messageId: string;
  node: WorkflowStepNode;
  state: WorkflowStepState | undefined;
  /** Earlier passes a loop ran again, oldest first. */
  earlier: WorkflowStepState[] | undefined;
  run: WorkflowRunState;
  canAct: boolean;
}) {
  const rerunFrom = useChatRerunWorkflowFrom();
  const applyStep = useChatApplyWorkflowStep();
  const scrollToBottom = useChatScrollToBottom();
  const modelId = state?.modelId ?? (isModelNode(node) ? node.model?.modelId : undefined);
  const status = state?.status ?? "pending";
  const output = state?.output ?? "";
  const isActive = status === "running" || status === "waiting";
  const isMessage =
    run.outputNodeId === node.id && run.status !== "running" && run.outputIteration === undefined;
  // A Decision hands on its input; the text belongs to the step before it.
  const showsOutput = node.type !== "decision";

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine
          status={
            isActive
              ? "running"
              : status === "error"
                ? "error"
                : status === "pending" || status === "inactive"
                  ? "pending"
                  : undefined
          }
        >
          <TraceIcon>
            <StepStatusIcon node={node} status={status} />
          </TraceIcon>
          {/* The name stays whole; the model and details give way first. */}
          <TraceTitle className="shrink-0">{node.name}</TraceTitle>
          <TraceDescription className="flex min-w-0 shrink items-center gap-1.5 truncate">
            <StepDescription node={node} state={state} modelId={modelId} isMessage={isMessage} />
          </TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="group/step flex flex-col gap-2">
        {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
        {state?.retriedErrors?.length ? (
          <p className="text-xs text-muted-foreground">
            Tried again after: {state.retriedErrors.join(" · ")}
          </p>
        ) : null}
        {node.type === "decision" && state?.decision ? <DecisionSummary state={state} /> : null}
        {!showsOutput ? null : output ? (
          <Streamdown
            mode={isActive ? "streaming" : "static"}
            isAnimating={isActive}
            className="text-[13px] leading-relaxed text-muted-foreground"
          >
            {output}
          </Streamdown>
        ) : !state?.error ? (
          <p className="text-xs">
            {status === "inactive"
              ? "Not run: a Decision took the other branch."
              : status === "pending"
                ? "Not run."
                : "No output yet."}
          </p>
        ) : null}
        {earlier?.length ? (
          <EarlierPasses
            node={node}
            passes={earlier}
            messageId={messageId}
            run={run}
            canAct={canAct}
          />
        ) : null}
        {/* Row actions show on hover (or keyboard focus), so the output reads first. */}
        <div className="-ml-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/step:opacity-100 focus-within:opacity-100">
          {canAct && showsOutput && output.trim() && !isMessage ? (
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
          {canAct ? (
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
          ) : null}
          {/* At the end of a long output, so it closes without scrolling back up. */}
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={(event) => collapseTrace(event.currentTarget)}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} data-icon="inline-start" />
            Collapse
          </Button>
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
});

/** What a Decision answered and where the run went from there. */
function DecisionSummary({ state }: { state: WorkflowStepState }) {
  const decision = state.decision!;
  return (
    <div className="flex flex-col gap-0.5 text-[13px] leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground/80">
          {state.status === "skipped" ? "Disabled" : decision.answer ? "Yes" : "No"}
        </span>
        {decision.reason ? ` — ${decision.reason}` : null}
      </p>
      <p className="text-xs">
        {/* A run the limit stopped already says so in the step's error. */}
        {decision.loop && !decision.limitReached
          ? `Looped back (${decision.loop.count} of ${decision.loop.max}).`
          : decision.limitReached
            ? state.status === "error"
              ? null
              : `Looped ${decision.loop?.max ?? 0} times, the most allowed, so it went on along ${
                  decision.branch === "true" ? "Yes" : "No"
                }.`
            : `Went on along ${decision.branch === "true" ? "Yes" : "No"}.`}
        {decision.method === "text" ? " Read from a plain-text answer." : null}
      </p>
    </div>
  );
}

/** A step's earlier passes, each one a nested row; any can be used as the message. */
function EarlierPasses({
  node,
  passes,
  messageId,
  run,
  canAct,
}: {
  node: WorkflowStepNode;
  passes: WorkflowStepState[];
  messageId: string;
  run: WorkflowRunState;
  canAct: boolean;
}) {
  const applyStep = useChatApplyWorkflowStep();
  return (
    <Trace className="mt-1">
      {passes.map((pass) => {
        const iteration = pass.iteration ?? 1;
        const isMessage =
          run.outputNodeId === node.id &&
          run.status !== "running" &&
          run.outputIteration === iteration;
        return (
          <TraceCollapsible key={iteration}>
            <TraceCollapsibleTrigger>
              <TraceLine status={pass.status === "error" ? "error" : undefined}>
                <TraceIcon>
                  <StepStatusIcon node={node} status={pass.status} />
                </TraceIcon>
                <TraceTitle>Pass {iteration}</TraceTitle>
                <TraceDescription className="truncate">
                  {[
                    node.type === "decision" && pass.decision
                      ? pass.decision.answer
                        ? "Yes"
                        : "No"
                      : null,
                    pass.status === "stopped" ? "started over" : null,
                    pass.status === "error" ? "failed" : null,
                    isMessage ? "in message" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </TraceDescription>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="group/pass flex flex-col gap-2">
              {pass.error ? <p className="text-xs text-destructive">{pass.error}</p> : null}
              {node.type === "decision" && pass.decision ? (
                <DecisionSummary state={pass} />
              ) : pass.output ? (
                <Streamdown
                  mode="static"
                  className="text-[13px] leading-relaxed text-muted-foreground"
                >
                  {pass.output}
                </Streamdown>
              ) : (
                <p className="text-xs">No output.</p>
              )}
              {canAct && node.type !== "decision" && pass.output.trim() && !isMessage ? (
                <div className="-ml-2 flex opacity-0 transition-opacity duration-100 group-hover/pass:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => void applyStep(messageId, node.id, iteration)}
                  >
                    <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
                    Use as message
                  </Button>
                </div>
              ) : null}
            </TraceCollapsibleContent>
          </TraceCollapsible>
        );
      })}
    </Trace>
  );
}

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
          : status === "skipped" || status === "inactive"
            ? ViewOffSlashIcon
            : node.type === "merge"
              ? MergeIcon
              : node.type === "decision"
                ? GitBranchIcon
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
  if (state?.status === "inactive") parts.push("branch not taken");
  if (node.type === "decision" && state?.decision && state.status !== "skipped") {
    parts.push(
      [
        state.decision.answer ? "Yes" : "No",
        state.decision.loop && !state.decision.limitReached
          ? `loop ${state.decision.loop.count}/${state.decision.loop.max}`
          : null,
        state.decision.limitReached ? "loop limit" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  if ((state?.iteration ?? 1) > 1 && node.type !== "decision") {
    parts.push(`pass ${state!.iteration}`);
  }
  if ((state?.attempt ?? 1) > 1 && isModelNode(node)) {
    parts.push(`try ${state!.attempt} of ${getStepRetries(node) + 1}`);
  }
  if (state?.status === "stopped") parts.push(state.partial ? "stopped · partial" : "stopped");
  // A Decision stopped by its loop limit already says "loop limit".
  if (state?.status === "error" && !state.decision?.limitReached) {
    parts.push(
      ["failed", state.partial ? "partial" : null, state.continued ? "continued" : null]
        .filter(Boolean)
        .join(" · "),
    );
  }
  if (state?.reused) parts.push("kept");
  else if (state?.status === "done" && state.startedAt && state.endedAt && isModelNode(node)) {
    parts.push(formatDuration(state.endedAt - state.startedAt));
  }

  return (
    <>
      {isModelNode(node) && modelId ? (
        <WorkflowModelName modelId={modelId} className="shrink" />
      ) : null}
      {parts.length > 0 ? (
        <span className="truncate">
          {isModelNode(node) && modelId ? "· " : ""}
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
