import * as React from "react";
import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

function Trace({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="trace"
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 *:has-[>[data-slot=trace-line]]:flex *:has-[>[data-slot=trace-line]]:w-fit *:has-[>[data-slot=trace-line]]:max-w-full *:has-[>[data-slot=trace-line]]:min-w-0 *:has-[>[data-slot=trace-line]]:rounded-md *:has-[>[data-slot=trace-line]]:text-left *:has-[>[data-slot=trace-line]]:outline-none *:has-[>[data-slot=trace-line]]:focus-visible:ring-3 *:has-[>[data-slot=trace-line]]:focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

function TraceLine({
  className,
  status,
  ...props
}: React.ComponentProps<"span"> & {
  status?: "running" | "error" | "pending";
}) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "flex w-fit max-w-full min-w-0 items-center gap-2 text-[13px] text-muted-foreground transition-colors in-[a:hover,button:hover]:text-foreground data-[status=error]:text-destructive data-[status=error]:in-[a:hover,button:hover]:text-destructive data-[status=pending]:opacity-60 data-[status=running]:*:data-[slot=trace-title]:shimmer",
        className,
      )}
      {...props}
    />
  );
}

function TraceIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-icon"
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [[data-slot=trace-title]~&]:-ml-1",
        className,
      )}
      {...props}
    />
  );
}

function TraceTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-title"
      className={cn("min-w-0 truncate motion-reduce:shimmer-none", className)}
      {...props}
    />
  );
}

function TraceDescription({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-description"
      className={cn("shrink-0 text-muted-foreground/70 tabular-nums", className)}
      {...props}
    />
  );
}

const OPEN_TRACE_SELECTOR = "[data-slot=trace-collapsible][data-trace-open]";

/** How to close each mounted row, by its `data-trace-id`. */
const traceClosers = new Map<string, () => void>();

/**
 * Controlled (`open` + `onOpenChange`) or not, a row can be closed from
 * outside with `collapseTrace` / `collapseTraces`, e.g. from a context menu.
 */
function TraceCollapsible({
  className,
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  ...props
}: Omit<React.ComponentProps<typeof Collapsible>, "open" | "onOpenChange" | "defaultOpen"> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [innerOpen, setInnerOpen] = React.useState(defaultOpen);
  const open = openProp ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  const collapse = React.useEffectEvent(() => setOpen(false));
  // Found through the DOM by id rather than a ref: the root's ref isn't
  // reliably attached inside the chat's Activity boundary.
  const id = React.useId();

  React.useEffect(() => {
    traceClosers.set(id, collapse);
    return () => {
      traceClosers.delete(id);
    };
  }, [id]);

  return (
    <Collapsible
      data-slot="trace-collapsible"
      data-trace-id={id}
      data-trace-open={open ? "" : undefined}
      open={open}
      onOpenChange={(next) => setOpen(next)}
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    />
  );
}

function closeTrace(trace: Element) {
  const id = trace.getAttribute("data-trace-id");
  if (id) traceClosers.get(id)?.();
}

/** The open trace row `target` sits in, the innermost one first. */
function findOpenTrace(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(OPEN_TRACE_SELECTOR) : null;
}

/**
 * Closes the open trace row around `target`, bringing its header into view:
 * it is often above the screen after reading a long output.
 */
function collapseTrace(target: EventTarget | null) {
  const trace = findOpenTrace(target);
  if (!trace) return;
  closeTrace(trace);
  trace
    .querySelector("[data-slot=trace-collapsible-trigger]")
    ?.scrollIntoView({ block: "nearest" });
}

function hasOpenTraces(root: ParentNode): boolean {
  return root.querySelector(OPEN_TRACE_SELECTOR) !== null;
}

/** Closes every open trace row inside `root`. */
function collapseTraces(root: ParentNode) {
  for (const trace of root.querySelectorAll(OPEN_TRACE_SELECTOR)) closeTrace(trace);
}

function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="trace-collapsible-trigger"
      className={cn(
        "group/trace-collapsible-trigger flex w-fit max-w-full min-w-0 items-center gap-1 rounded-md text-left text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 has-[[data-status=error]]:text-destructive",
        className,
      )}
      {...props}
    >
      {children}
      <TraceIcon className="transition-transform group-aria-expanded/trace-collapsible-trigger:rotate-90">
        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
      </TraceIcon>
    </CollapsibleTrigger>
  );
}

function TraceCollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      className="h-(--collapsible-panel-height) min-w-0 overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0"
      {...props}
    >
      <div
        data-slot="trace-collapsible-content-inner"
        className={cn(
          "mt-2 mb-1 ml-[calc(--spacing(2)-1px)] min-w-0 border-l pr-1 pl-4 leading-relaxed wrap-break-word text-muted-foreground",
          className,
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

export {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
  collapseTrace,
  collapseTraces,
  findOpenTrace,
  hasOpenTraces,
};
