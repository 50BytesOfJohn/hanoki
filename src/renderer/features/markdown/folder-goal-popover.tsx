import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { FolderWordGoalStats } from "@shared/ipc";
import { MAX_WORD_GOAL_TARGET } from "@shared/markdown/word-goal";

import { foldersApi } from "@/api/folders";
import { Button } from "@/components/ui/button";
import { NumberField, NumberFieldGroup, NumberFieldInput } from "@/components/ui/number-field";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toastManager } from "@/components/ui/toast";
import { queryKeys } from "@/queries/keys";

const DEFAULT_TARGET = 50_000;
const GOAL_INPUT_ERROR = "Enter a goal of 1 or more";
const GOAL_ACTION_CLASS = "h-7 w-full";
const numberFormat = new Intl.NumberFormat();

function goalNumberError(value: number | null): string | null {
  if (value === null || !Number.isInteger(value) || value < 1) return GOAL_INPUT_ERROR;
  if (value > MAX_WORD_GOAL_TARGET) {
    return `Enter a goal of ${MAX_WORD_GOAL_TARGET.toLocaleString("en-US")} or fewer`;
  }
  return null;
}

export function FolderGoalPopover({
  folderId,
  folderName,
  stats,
  locale,
  label,
  anchor,
  open,
  onOpenChange,
  children,
}: {
  folderId: string;
  folderName: string;
  stats?: FolderWordGoalStats;
  locale?: Intl.LocalesArgument;
  label?: string;
  anchor?: HTMLElement | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      {children ? (
        <PopoverTrigger
          className="inline-flex min-w-0 items-center gap-1 rounded-sm text-left text-inherit outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-focus/60"
          aria-label={label}
        >
          {children}
        </PopoverTrigger>
      ) : null}
      <PopoverContent
        anchor={anchor ?? undefined}
        align="end"
        className="w-64 gap-3 p-3"
        sideOffset={6}
      >
        {isOpen ? (
          <GoalForm
            folderId={folderId}
            folderName={folderName}
            stats={stats}
            locale={locale}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function GoalForm({
  folderId,
  folderName,
  stats: statsProp,
  locale,
  onClose,
}: {
  folderId: string;
  folderName: string;
  stats?: FolderWordGoalStats;
  locale?: Intl.LocalesArgument;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetched = useQuery({
    queryKey: queryKeys.wordGoals.byFolder(folderId),
    queryFn: () => foldersApi.getWordGoal(folderId),
    enabled: statsProp === undefined,
  });
  const stats = statsProp ?? fetched.data;
  const [target, setTarget] = React.useState<number | null>(DEFAULT_TARGET);
  const targetRef = React.useRef<number | null>(DEFAULT_TARGET);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const next = stats?.targetWords ?? DEFAULT_TARGET;
    targetRef.current = next;
    setTarget(next);
  }, [stats?.targetWords]);

  React.useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.wordGoals.all });
  const setGoal = useMutation({
    mutationFn: (targetWords: number) => foldersApi.setWordGoal(folderId, targetWords),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: () => {
      toastManager.add({
        type: "error",
        title: "Word goal could not be saved",
        description: "The goal was not saved.",
      });
    },
  });
  const clearGoal = useMutation({
    mutationFn: () => foldersApi.clearWordGoal(folderId),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: () => {
      toastManager.add({
        type: "error",
        title: "Word goal could not be cleared",
        description: "The goal was not cleared.",
      });
    },
  });

  const submitGoal = () => {
    const value = targetRef.current;
    const message = goalNumberError(value);
    setError(message);
    if (message || value === null) return;
    setGoal.mutate(value);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submitGoal();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== "Enter") return;
        if (event.target instanceof HTMLButtonElement && event.target.type !== "submit") return;
        event.preventDefault();
        submitGoal();
      }}
    >
      <PopoverTitle className="text-[13px]">Word goal · {folderName}</PopoverTitle>
      <NumberField
        locale={locale}
        step="any"
        value={target}
        onValueChange={(value) => {
          targetRef.current = value;
          setTarget(value);
          setError(null);
        }}
      >
        <NumberFieldGroup>
          <NumberFieldInput
            aria-describedby={error ? "word-goal-error" : undefined}
            aria-invalid={error ? true : undefined}
            aria-label="Word goal target"
            className="text-left"
          />
        </NumberFieldGroup>
      </NumberField>
      {error ? (
        <p className="text-[11px] text-muted-foreground" id="word-goal-error">
          {error}
        </p>
      ) : null}
      {stats ? (
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground tabular-nums">
          <div className="flex items-center justify-between gap-2">
            <span>Since start</span>
            <span className="inline-flex items-center gap-1">
              {numberFormat.format(stats.sinceStart)}
              <span className="size-6 shrink-0" aria-hidden="true" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Today</span>
            <span className="inline-flex items-center gap-1">
              {numberFormat.format(stats.today)}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Copy today's word count"
                onClick={() => {
                  const today = stats.today;
                  void navigator.clipboard
                    .writeText(String(today))
                    .then(() => {
                      setCopied(true);
                      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
                      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => {
                      setCopied(false);
                    });
                }}
              >
                <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
              </Button>
            </span>
          </div>
        </div>
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className={GOAL_ACTION_CLASS}
        disabled={setGoal.isPending}
      >
        Set goal
      </Button>
      {stats ? (
        <>
          <Separator />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`${GOAL_ACTION_CLASS} text-destructive hover:text-destructive`}
            disabled={clearGoal.isPending}
            onClick={() => clearGoal.mutate()}
          >
            Clear goal
          </Button>
        </>
      ) : null}
    </form>
  );
}
