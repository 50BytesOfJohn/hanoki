import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { foldersApi } from "@/api/folders";
import { Button } from "@/components/ui/button";
import { NumberField, NumberFieldGroup, NumberFieldInput } from "@/components/ui/number-field";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toastManager } from "@/components/ui/toast";
import { queryKeys } from "@/queries/keys";

const DEFAULT_TARGET = 50_000;
const numberFormat = new Intl.NumberFormat();

export function FolderGoalPopover({
  folderId,
  folderName,
  label,
  anchor,
  open,
  onOpenChange,
  children,
}: {
  folderId: string;
  folderName: string;
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
          className="inline-flex min-w-0 items-center gap-1 text-left text-inherit"
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
          <GoalForm folderId={folderId} folderName={folderName} onClose={() => setOpen(false)} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function GoalForm({
  folderId,
  folderName,
  onClose,
}: {
  folderId: string;
  folderName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const stats = useQuery({
    queryKey: queryKeys.wordGoals.byFolder(folderId),
    queryFn: () => foldersApi.getWordGoal(folderId),
  });
  const [target, setTarget] = React.useState<number | null>(DEFAULT_TARGET);
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    setTarget(stats.data?.targetWords ?? DEFAULT_TARGET);
  }, [stats.data?.targetWords]);

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
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Word goal could not be saved",
        description: error.message,
      });
    },
  });
  const clearGoal = useMutation({
    mutationFn: () => foldersApi.clearWordGoal(folderId),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Word goal could not be cleared",
        description: error.message,
      });
    },
  });

  const today = stats.data?.today ?? 0;
  const sinceStart = stats.data?.sinceStart ?? 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (target === null || target < 1) return;
        setGoal.mutate(target);
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
        if (target === null || target < 1) return;
        setGoal.mutate(target);
      }}
    >
      <PopoverTitle className="text-[13px]">Word goal · {folderName}</PopoverTitle>
      <NumberField
        min={1}
        value={target}
        onValueChange={(value) => {
          setTarget(value);
        }}
      >
        <NumberFieldGroup>
          <NumberFieldInput aria-label="Word goal target" className="text-left" />
        </NumberFieldGroup>
      </NumberField>
      <div className="flex flex-col gap-1 text-[11px] text-muted-foreground tabular-nums">
        <div className="flex items-center justify-between gap-2">
          <span>Since start</span>
          <span>{numberFormat.format(sinceStart)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Today</span>
          <span className="inline-flex items-center gap-1">
            {numberFormat.format(today)}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Copy today's word count"
              onClick={() => {
                void navigator.clipboard.writeText(String(today)).then(() => {
                  setCopied(true);
                  if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
                  copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
            </Button>
          </span>
        </div>
      </div>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={setGoal.isPending || target === null}
      >
        Set goal
      </Button>
      {stats.data ? (
        <>
          <Separator />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
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
