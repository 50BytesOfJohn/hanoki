import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Add01Icon,
  AiMagicIcon,
  ArrowDown01Icon,
  Delete02Icon,
  FlowConnectionIcon,
  GitBranchIcon,
  MergeIcon,
  PencilEdit01Icon,
  SidebarRightIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useChatId,
  useChatIsInteractionLocked,
  useChatModelId,
} from "@/features/chat/chat-context";
import { useOptionalChatPane } from "@/features/chat/chat-pane-context";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useUpdateChatSettings } from "@/mutations/chats";
import { useCreateWorkflow } from "@/mutations/workflows";
import { getChatQueryOptions } from "@/queries/chats";
import { listWorkflowsQueryOptions } from "@/queries/workflows";
import type { ChatInfo } from "@shared/ipc";
import {
  DEFAULT_WORKFLOW_TITLE,
  getOrderedSteps,
  type WorkflowModelOverride,
  type WorkflowStepNode,
  getPassModels,
  getStepRetries,
  isModelNode,
} from "@shared/workflow/graph";
import { cn } from "cn";

import {
  useChatWorkflowStatus,
  useChatWorkflowUnavailableStepsMessage,
} from "./workflow-model-availability";
import { WorkflowModelPicker } from "./workflow-model-picker";
import { formatInputRole, formatPassModels, formatRetries } from "./workflow-labels";
import { useWorkflowSidebarPreferences } from "./workflow-sidebar-store";

const NO_WORKFLOW = "none";

/** Opens a workflow in the editor beside this chat, so both stay in view. */
function useOpenWorkflowBeside() {
  const pane = useOptionalChatPane();
  const splitPane = useWorkspaceStore((state) => state.splitPane);
  const openTab = useWorkspaceStore((state) => state.openTab);
  return React.useCallback(
    (workflowId: string) => {
      if (pane) splitPane(pane.tabId, pane.paneId, workflowId, "workflow", "right");
      else openTab({ type: "workflow", itemId: workflowId });
    },
    [openTab, pane, splitPane],
  );
}

/** The composer's workflow switch: pick, remove, create or edit the chat's workflow. */
export function ChatWorkflowMenu() {
  const chatId = useChatId();
  const isInteractionLocked = useChatIsInteractionLocked();
  const workspaceId = useWorkspaceStore((state) => state.workspace?.id ?? null);
  const { data: workflows = [], refetch } = useQuery(listWorkflowsQueryOptions(workspaceId));
  const updateChatSettings = useUpdateChatSettings();
  const createWorkflow = useCreateWorkflow();
  const openWorkflowBeside = useOpenWorkflowBeside();
  const { workflowId, load, blockReason } = useChatWorkflowStatus(chatId);
  const activeTitle =
    load.status === "ready"
      ? load.workflow.title
      : load.status === "missing"
        ? "Deleted workflow"
        : (workflows.find((workflow) => workflow.id === workflowId)?.title ?? "Workflow");

  const setWorkflow = (nextId: string | null) =>
    updateChatSettings.mutate({ id: chatId, input: { workflowId: nextId } });

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void refetch();
      }}
    >
      <Tooltip>
        <DropdownMenuTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size={workflowId ? "sm" : "icon-sm"}
                  aria-label="Workflow"
                  aria-pressed={workflowId !== null}
                  disabled={isInteractionLocked}
                  className={cn(
                    "text-foreground data-popup-open:bg-hover",
                    workflowId && "max-w-48 gap-1.5 px-2 text-[13px] font-normal",
                    blockReason && "text-warning",
                  )}
                />
              }
            />
          }
        >
          <HugeiconsIcon icon={FlowConnectionIcon} />
          {workflowId ? <span className="truncate">{activeTitle}</span> : null}
        </DropdownMenuTrigger>
        <TooltipContent className="max-w-72">
          {blockReason
            ? blockReason
            : workflowId
              ? "Replies run through this workflow"
              : "Run replies through a workflow"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workflow</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={workflowId ?? NO_WORKFLOW}
            onValueChange={(value: string) => setWorkflow(value === NO_WORKFLOW ? null : value)}
          >
            <DropdownMenuRadioItem value={NO_WORKFLOW} closeOnClick>
              None
            </DropdownMenuRadioItem>
            {workflows.map((workflow) => (
              <DropdownMenuRadioItem key={workflow.id} value={workflow.id} closeOnClick>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{workflow.title}</span>
                  {workflow.folderPath ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {workflow.folderPath}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {workflowId && load.status !== "missing" ? (
            <DropdownMenuItem onClick={() => openWorkflowBeside(workflowId)}>
              <HugeiconsIcon icon={PencilEdit01Icon} />
              Edit Workflow
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={!workspaceId || createWorkflow.isPending}
            onClick={() => {
              if (!workspaceId) return;
              createWorkflow.mutate(
                { workspaceId, title: DEFAULT_WORKFLOW_TITLE, folderId: null },
                {
                  onSuccess: (workflow) => {
                    setWorkflow(workflow.id);
                    openWorkflowBeside(workflow.id);
                  },
                },
              );
            }}
          >
            <HugeiconsIcon icon={Add01Icon} />
            New Workflow
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FLOATING_BUTTON_CLASS_NAME =
  "bg-surface/80 text-muted-foreground backdrop-blur data-popup-open:bg-hover data-popup-open:text-foreground";

/**
 * The chat's workflow at a glance, as one floating card beside the conversation:
 * each step with its model (switchable for this chat only) and context
 * setting. The card can fold to its header, or be hidden to a button, which is
 * also all a narrow chat pane shows; there the button opens the card above the
 * conversation.
 */
export function ChatWorkflowSidebar() {
  const chatId = useChatId();
  const { data: chat } = useQuery(getChatQueryOptions(chatId));
  const hidden = useWorkflowSidebarPreferences((state) => state.hidden);
  const setHidden = useWorkflowSidebarPreferences((state) => state.setHidden);
  const workflowId = chat?.data.settings.workflowId ?? null;
  if (!chat || !workflowId) return null;

  return (
    <>
      {hidden ? null : (
        <aside
          aria-label="Workflow"
          className="hidden w-64 shrink-0 flex-col gap-2 overflow-y-auto py-3 pr-3 scrollbar @4xl/chat:flex"
        >
          <WorkflowCard
            chat={chat}
            workflowId={workflowId}
            placement="sidebar"
            onHide={() => setHidden(true)}
          />
        </aside>
      )}
      <div className="absolute top-2 right-3 z-20 @4xl/chat:hidden">
        <Popover>
          <Tooltip>
            <PopoverTrigger
              render={
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Show workflow"
                      className={FLOATING_BUTTON_CLASS_NAME}
                    />
                  }
                />
              }
            >
              <HugeiconsIcon icon={FlowConnectionIcon} />
            </PopoverTrigger>
            <TooltipContent side="left">Workflow</TooltipContent>
          </Tooltip>
          <PopoverContent
            side="bottom"
            align="end"
            className="max-h-[min(36rem,var(--available-height))] w-64 gap-2 overflow-y-auto border-0 bg-transparent p-0 shadow-none ring-0 scrollbar"
          >
            <WorkflowCard chat={chat} workflowId={workflowId} placement="popover" />
          </PopoverContent>
        </Popover>
      </div>
      {hidden ? (
        <div className="absolute top-2 right-3 z-20 hidden @4xl/chat:block">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Show workflow sidebar"
                  className={FLOATING_BUTTON_CLASS_NAME}
                  onClick={() => setHidden(false)}
                />
              }
            >
              <HugeiconsIcon icon={FlowConnectionIcon} />
            </TooltipTrigger>
            <TooltipContent side="left">Show workflow</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </>
  );
}

function WorkflowCard({
  chat,
  workflowId,
  placement,
  onHide,
}: {
  chat: ChatInfo;
  workflowId: string;
  /** Only the sidebar card folds; the popover is opened to be read. */
  placement: "sidebar" | "popover";
  onHide?: () => void;
}) {
  const status = useChatWorkflowStatus(chat.id);
  const workflow = status.load.workflow;
  const updateChatSettings = useUpdateChatSettings();
  const openWorkflowBeside = useOpenWorkflowBeside();
  const storedCollapsed = useWorkflowSidebarPreferences((state) => state.collapsed);
  const setCollapsed = useWorkflowSidebarPreferences((state) => state.setCollapsed);
  const collapsed = placement === "sidebar" && storedCollapsed;
  const steps = React.useMemo(
    () => (workflow ? getOrderedSteps(workflow.data.graph) : []),
    [workflow],
  );
  const overrides = status.overrides;
  const chatModelId = useChatModelId();
  const unavailableStepsMessage = useChatWorkflowUnavailableStepsMessage(status);
  const problem = workflow?.data.graphError
    ? status.blockReason
    : (unavailableStepsMessage ??
      (status.load.status === "missing"
        ? "This workflow was deleted. Remove it or pick another one."
        : null));
  const remove = () => updateChatSettings.mutate({ id: chat.id, input: { workflowId: null } });

  return (
    <section
      aria-label={workflow?.title ?? "Workflow"}
      className="flex flex-col divide-y divide-separator rounded-lg border border-border bg-surface-secondary/95 shadow-lg shadow-black/20 backdrop-blur-sm"
    >
      <header className="flex items-center gap-0.5 py-1 pr-1 pl-1">
        {placement === "sidebar" ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("text-muted-foreground", collapsed && problem && "text-warning")}
            aria-label={collapsed ? "Expand workflow" : "Collapse workflow"}
            aria-expanded={!collapsed}
            title={collapsed && problem ? problem : undefined}
            onClick={() => setCollapsed(!collapsed)}
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn(
                "size-3.5! transition-transform duration-150",
                collapsed && "-rotate-90",
              )}
            />
          </Button>
        ) : (
          <HugeiconsIcon
            icon={FlowConnectionIcon}
            className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
          />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[13px] font-medium transition-colors duration-100 hover:text-foreground/80"
          disabled={!workflow}
          onClick={() => openWorkflowBeside(workflowId)}
        >
          {workflow?.title ?? (status.load.status === "missing" ? "Workflow not found" : "")}
        </button>
        {onHide ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Hide workflow sidebar"
                  onClick={onHide}
                />
              }
            >
              <HugeiconsIcon icon={SidebarRightIcon} className="size-3.5!" />
            </TooltipTrigger>
            <TooltipContent>Hide sidebar</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove workflow from chat"
                onClick={remove}
              />
            }
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5!" />
          </TooltipTrigger>
          <TooltipContent>Remove from chat</TooltipContent>
        </Tooltip>
      </header>
      {collapsed ? null : (
        <>
          {problem ? (
            <p role="status" className="px-2.5 py-2 text-xs text-warning">
              {problem}
            </p>
          ) : null}
          {workflow ? (
            <ol className="flex flex-col divide-y divide-separator">
              {steps.map((step) => (
                <WorkflowStepRow
                  key={step.id}
                  step={step}
                  chatModelId={chatModelId}
                  override={overrides?.[step.id] ?? null}
                  onOverride={(model) =>
                    updateChatSettings.mutate({
                      id: chat.id,
                      input: { workflowModelOverride: { workflowId, nodeId: step.id, model } },
                    })
                  }
                />
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}

function WorkflowStepRow({
  step,
  chatModelId,
  override,
  onOverride,
}: {
  step: WorkflowStepNode;
  chatModelId: string | null;
  override: WorkflowModelOverride | null;
  onOverride: (model: WorkflowModelOverride | null) => void;
}) {
  const presets = React.useMemo(
    () => [
      ...(isModelNode(step) && step.model
        ? [{ key: "workflow", label: "Workflow model", modelId: step.model.modelId }]
        : []),
      { key: "chat", label: "Chat model", modelId: chatModelId },
    ],
    [chatModelId, step],
  );
  const workflowModel = isModelNode(step) ? step.model : null;
  // With no model of its own, the step already uses the chat's; "chat" would only repeat that.
  const activePresetKey =
    override === "chat" || (!override && !workflowModel) ? "chat" : override ? null : "workflow";

  return (
    <li className={cn("flex flex-col gap-1 px-2.5 py-2", step.disabled && "opacity-60")}>
      <div className="flex items-center gap-2 text-[13px]">
        <HugeiconsIcon
          icon={
            step.type === "ai" ? AiMagicIcon : step.type === "decision" ? GitBranchIcon : MergeIcon
          }
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className={cn("min-w-0 flex-1 truncate", step.disabled && "line-through")}>
          {step.name}
        </span>
      </div>
      {isModelNode(step) ? (
        <>
          <WorkflowModelPicker
            size="xs"
            value={override && override !== "chat" ? override : null}
            presets={presets}
            activePresetKey={activePresetKey}
            onSelectPreset={(key) => onOverride(key === "chat" && workflowModel ? "chat" : null)}
            onSelectModel={onOverride}
            className="-mx-1.5 w-[calc(100%+0.75rem)]"
          />
          <span className="text-xs text-muted-foreground">
            {step.disabled
              ? "Disabled"
              : [
                  step.type === "decision"
                    ? `Decision${step.includeContext ? " · chat context" : ""}`
                    : step.includeContext
                      ? "Chat context"
                      : "No context",
                  step.type === "ai" ? formatInputRole(step.role) : null,
                  step.type === "ai" && getPassModels(step).length > 0
                    ? formatPassModels(getPassModels(step).length)
                    : null,
                  step.type === "ai" && step.onFailure === "continue"
                    ? "Continues on failure"
                    : null,
                  getStepRetries(step) > 0 ? formatRetries(getStepRetries(step)) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">
          {step.disabled ? "Disabled" : "Merge, no model"}
        </span>
      )}
    </li>
  );
}
