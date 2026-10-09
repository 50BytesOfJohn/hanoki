import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const BODY_LINE = "h-[calc(0.9375rem*1.72)]";

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function remoteImageHost(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function RemoteImagePlaceholder({
  src,
  alt,
  layout,
}: {
  src: string;
  alt: string;
  layout: "block" | "inline";
}) {
  const host = remoteImageHost(src);
  const label = alt.trim();
  const visible = label.length > 0 ? label : "Image not loaded";
  const ariaLabel =
    label.length > 0
      ? `Image not loaded: ${label}, from ${host}`
      : `Image not loaded, from ${host}`;
  const block = layout === "block";
  const row = (
    <span
      role="img"
      aria-label={ariaLabel}
      data-remote-image=""
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
        icon={ImageNotFound01Icon}
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 truncate">
        {visible}
        {block ? <span className="text-muted-foreground/60">{` · ${host}`}</span> : null}
      </span>
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger delay={600} render={row} />
      <TooltipContent className="flex-col items-start">
        <span>Remote images don't load in Hanoki</span>
        <span className="break-all text-background/60">{src}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function meaningfulHastChildren(node: HastNode): HastNode[] {
  return (node.children ?? []).filter((child) => {
    if (child.type === "text") return (child.value ?? "").trim().length > 0;
    return child.type === "element";
  });
}

export function rehypeBlockImages() {
  return (tree: HastNode) => {
    markBlockImages(tree);
  };
}

function markBlockImages(node: HastNode) {
  if (node.type === "element" && node.tagName === "p") {
    const meaningful = meaningfulHastChildren(node);
    const only = meaningful[0];
    if (meaningful.length === 1 && only?.tagName === "img") {
      only.properties = { ...only.properties, dataBlockImage: "true" };
    }
  }
  for (const child of node.children ?? []) markBlockImages(child);
}
