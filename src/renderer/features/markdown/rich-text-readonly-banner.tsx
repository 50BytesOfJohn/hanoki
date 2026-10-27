import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const BANNER_TEXT = "Read-only in Rich text, so none of this note's formatting is lost.";
const BANNER_ACTION = "Edit in Markdown";

export function RichTextReadonlyBanner({
  summary,
  onEditInMarkdown,
}: {
  summary: string | null;
  onEditInMarkdown: () => void;
}) {
  const label = (
    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{BANNER_TEXT}</span>
  );

  return (
    <div className="sticky top-0 z-10 border-b border-separator bg-surface">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-7 py-1.5">
        <HugeiconsIcon
          icon={InformationCircleIcon}
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        {summary ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={label} />
              <TooltipContent>{summary}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          label
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 text-muted-foreground"
          onClick={onEditInMarkdown}
        >
          {BANNER_ACTION}
        </Button>
      </div>
    </div>
  );
}
