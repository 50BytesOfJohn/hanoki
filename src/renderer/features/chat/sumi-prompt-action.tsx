import * as React from "react";
import { useCompletion } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { AiEditingIcon, ArrowShrink01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sumiSettingsQueryOptions } from "@/queries/settings";
import { selectAiServerPort, useSystemStore } from "@/stores/system-store";

interface SumiPromptActionProps {
  prompt: string;
  isDisabled: boolean;
  onReplace: (prompt: string) => void;
}

const SUMI_PROMPT_ACTIONS = [
  {
    id: "prompt-language-fix",
    label: "Fix language & grammar",
    description: "Correct mistakes and tidy the writing.",
    dialogDescription: "Sumi preserves the prompt’s meaning while correcting the writing.",
    loadingLabel: "Fixing your prompt…",
    icon: AiEditingIcon,
  },
  {
    id: "prompt-shorten",
    label: "Shorten",
    description: "Make the prompt concise and direct.",
    dialogDescription: "Sumi removes repetition and filler while keeping the essential details.",
    loadingLabel: "Shortening your prompt…",
    icon: ArrowShrink01Icon,
  },
] as const;

type SumiPromptActionId = (typeof SUMI_PROMPT_ACTIONS)[number]["id"];

export function SumiPromptAction({ prompt, isDisabled, onReplace }: SumiPromptActionProps) {
  const port = useSystemStore(selectAiServerPort);
  const { data: settings } = useQuery(sumiSettingsQueryOptions);
  const [isOpen, setIsOpen] = React.useState(false);
  const [sourcePrompt, setSourcePrompt] = React.useState("");
  const [activeAction, setActiveAction] = React.useState<(typeof SUMI_PROMPT_ACTIONS)[number]>(
    SUMI_PROMPT_ACTIONS[0],
  );
  const api = port ? `http://127.0.0.1:${port}/api/sumi` : "";
  const { completion, complete, error, isLoading, setCompletion, stop } = useCompletion({
    api,
    streamProtocol: "text",
    throttle: 30,
  });
  const promptActions = settings?.promptActions;
  const isAvailable = Boolean(promptActions?.enabled && promptActions.model);

  if (!isAvailable) {
    return null;
  }

  function runRefinement(nextPrompt: string, actionId: SumiPromptActionId) {
    if (!hasPromptContent(nextPrompt) || !api) {
      return;
    }

    setCompletion("");
    void complete(nextPrompt, { body: { feature: actionId } });
  }

  function startAction(actionId: SumiPromptActionId) {
    const action = SUMI_PROMPT_ACTIONS.find((candidate) => candidate.id === actionId);
    if (!action || !hasPromptContent(prompt)) {
      return;
    }

    setSourcePrompt(prompt);
    setActiveAction(action);
    setIsOpen(true);
    runRefinement(prompt, action.id);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      stop();
    }
    setIsOpen(nextOpen);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Sumi prompt actions"
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={isDisabled || !hasPromptContent(prompt) || !api}
            />
          }
        >
          <HugeiconsIcon icon={AiEditingIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" aria-label="Sumi prompt actions">
          <DropdownMenuGroup>
            {SUMI_PROMPT_ACTIONS.map((action) => (
              <DropdownMenuItem key={action.id} onClick={() => startAction(action.id)}>
                <HugeiconsIcon icon={action.icon} />
                <span className="flex flex-col gap-0.5">
                  <span>{action.label}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12">
            <DialogTitle>{activeAction.label}</DialogTitle>
            <DialogDescription>{activeAction.dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="min-h-48 px-4 py-4">
            {error ? (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-danger/30 bg-danger/5 px-6 text-center text-sm text-danger">
                {error.message || "Sumi could not refine this prompt."}
              </div>
            ) : completion ? (
              <div className="max-h-[min(24rem,50vh)] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-secondary px-3 py-3 text-sm leading-relaxed scrollbar">
                {completion}
                {isLoading ? (
                  <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-foreground/70 align-text-bottom" />
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div className="flex size-9 items-center justify-center rounded-full border border-border bg-surface-secondary">
                  <HugeiconsIcon icon={activeAction.icon} className="size-4 animate-pulse" />
                </div>
                <span>{isLoading ? activeAction.loadingLabel : "Waiting for Sumi…"}</span>
              </div>
            )}
          </div>

          <DialogFooter className="m-0 rounded-none px-4 py-3">
            <Button
              variant="secondary"
              disabled={isLoading}
              onClick={() => runRefinement(sourcePrompt, activeAction.id)}
            >
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              Try again
            </Button>
            <Button
              disabled={isLoading || !completion.trim() || Boolean(error)}
              onClick={() => {
                onReplace(completion.trim());
                handleOpenChange(false);
              }}
            >
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function hasPromptContent(prompt: string): boolean {
  return prompt.trim().length >= 1;
}
