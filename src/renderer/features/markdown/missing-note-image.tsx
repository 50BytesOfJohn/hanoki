import { ImageOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const BODY_LINE = "h-[calc(0.9375rem*1.72)]";

function imageFileName(path: string): string {
  const trimmed = path.trim();
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const name = (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).trim();
  if (!name || name === "." || name === "..") return "";
  return name;
}

export function MissingNoteImage({
  path,
  alt,
  layout,
}: {
  path: string;
  alt: string;
  layout: "block" | "inline";
}) {
  const fileName = imageFileName(path);
  const label = alt.trim();
  const visible = label.length > 0 ? label : "Image not found";
  const ariaLabel =
    label.length > 0
      ? `Image not found: ${label}${fileName ? `, ${fileName}` : ""}`
      : fileName
        ? `Image not found, ${fileName}`
        : "Image not found";
  const block = layout === "block";
  const row = (
    <span
      role="img"
      aria-label={ariaLabel}
      data-missing-image=""
      data-layout={layout}
      tabIndex={-1}
      className={cn(
        "cursor-default text-[12px] text-muted-foreground",
        block
          ? `flex w-full min-w-0 items-center gap-1.5 overflow-hidden ${BODY_LINE}`
          : "inline-flex max-w-full min-w-0 items-center gap-1 align-baseline leading-none",
      )}
    >
      <HugeiconsIcon
        icon={ImageOffIcon}
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 truncate">
        {visible}
        {block && fileName ? (
          <span className="text-muted-foreground/60">{` · ${fileName}`}</span>
        ) : null}
      </span>
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger delay={600} render={row} />
      <TooltipContent className="flex-col items-start">
        <span>Image not found</span>
        {path ? <span className="break-all text-background/60">{path}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
