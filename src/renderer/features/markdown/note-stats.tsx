import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { countMarkdownWords } from "@shared/markdown/word-count";
import type { FolderWordGoalStats } from "@shared/ipc";

import { foldersApi } from "@/api/folders";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/queries/keys";

import { FolderGoalPopover } from "./folder-goal-popover";
import { GoalRing } from "./goal-ring";

const numberFormat = new Intl.NumberFormat();

export function formatWordCount(count: number): string {
  return `${numberFormat.format(count)} ${count === 1 ? "word" : "words"}`;
}

export function formatNoteStats(total: number, selected: number | null): string {
  if (selected !== null && selected > 0) {
    return `${numberFormat.format(selected)} of ${formatWordCount(total)}`;
  }
  return formatWordCount(total);
}

export function NoteStatsFooter({
  itemId,
  markdown,
  selectionWords,
  isFocused,
}: {
  itemId: string;
  markdown: string;
  selectionWords: number | null;
  isFocused: boolean;
}) {
  const wait = markdown.length > 1_000_000 ? 1000 : 250;
  const [debouncedMarkdown] = useDebouncedValue(markdown, { wait });
  const words = React.useMemo(() => countMarkdownWords(debouncedMarkdown), [debouncedMarkdown]);
  const nearest = useQuery({
    queryKey: queryKeys.wordGoals.nearest(itemId),
    queryFn: () => foldersApi.nearestWordGoal(itemId),
  });
  const folderId = nearest.data?.folderId;
  const goal = useQuery({
    queryKey: queryKeys.wordGoals.byFolder(folderId ?? ""),
    queryFn: () => foldersApi.getWordGoal(folderId ?? ""),
    enabled: Boolean(folderId),
  });
  useInvalidateWordGoalsOnDayChange();

  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-end gap-1 text-[11px] tabular-nums",
        isFocused ? "text-muted-foreground" : "text-muted-foreground/60",
      )}
    >
      <span>{formatNoteStats(words, selectionWords)}</span>
      {goal.data ? <FolderGoalSegment stats={goal.data} /> : null}
    </div>
  );
}

function FolderGoalSegment({ stats }: { stats: FolderWordGoalStats }) {
  const label = `Word goal for ${stats.folderName}: ${numberFormat.format(stats.sinceStart)} of ${numberFormat.format(stats.targetWords)} words since start`;
  return (
    <FolderGoalPopover
      folderId={stats.folderId}
      folderName={stats.folderName}
      stats={stats}
      label={label}
    >
      <span aria-hidden="true">·</span>
      {stats.met ? (
        <HugeiconsIcon icon={Tick02Icon} className="size-2.5 text-current" />
      ) : (
        <GoalRing progress={stats.targetWords > 0 ? stats.sinceStart / stats.targetWords : 0} />
      )}
      <span className="max-w-32 truncate">{stats.folderName}</span>
      <span>
        {numberFormat.format(stats.sinceStart)} / {numberFormat.format(stats.targetWords)}
      </span>
    </FolderGoalPopover>
  );
}

function useInvalidateWordGoalsOnDayChange() {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    let timer = 0;
    const arm = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      timer = window.setTimeout(
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.wordGoals.all });
          arm();
        },
        Math.max(1000, next.getTime() - now.getTime()),
      );
    };
    arm();
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wordGoals.all });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [queryClient]);
}
