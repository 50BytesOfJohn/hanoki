/**
 * Context-window meter, adapted from AI Elements' `Context`
 * (https://ui.shadcn.com/docs/ai-elements/base/context). Same composable
 * shape, rebuilt on our Base UI Popover/Meter: it opens on hover *and* click,
 * tolerates an unknown window size, and leaves cost to the caller instead of
 * pricing tokens from a static catalog.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

const WARNING_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;
const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type ContextLevel = "normal" | "warning" | "critical";

interface ContextSchema {
  /** Tokens in the window; null while nothing has been measured. */
  usedTokens: number | null;
  /** Window size; null when the model does not report one. */
  maxTokens: number | null;
  /** The numbers are a best estimate rather than an exact reading. */
  isApproximate: boolean;
  ratio: number | null;
  level: ContextLevel;
}

const ContextContext = React.createContext<ContextSchema | null>(null);

function useContextValue() {
  const context = React.useContext(ContextContext);

  if (!context) {
    throw new Error("Context components must be used within Context");
  }

  return context;
}

type ContextProps = React.ComponentProps<typeof Popover> & {
  usedTokens: number | null;
  maxTokens: number | null;
  isApproximate?: boolean;
};

function Context({ usedTokens, maxTokens, isApproximate = false, ...props }: ContextProps) {
  const value = React.useMemo<ContextSchema>(() => {
    const ratio = usedTokens !== null && maxTokens ? usedTokens / maxTokens : null;

    return {
      usedTokens,
      maxTokens,
      isApproximate,
      ratio,
      level:
        ratio === null
          ? "normal"
          : ratio >= CRITICAL_RATIO
            ? "critical"
            : ratio >= WARNING_RATIO
              ? "warning"
              : "normal",
    };
  }, [isApproximate, maxTokens, usedTokens]);

  return (
    <ContextContext.Provider value={value}>
      <Popover {...props} />
    </ContextContext.Provider>
  );
}

const LEVEL_TEXT = {
  normal: "text-muted-foreground",
  warning: "text-warning",
  critical: "text-danger",
} satisfies Record<ContextLevel, string>;

function ContextIcon({ className, ...props }: React.ComponentProps<"svg">) {
  const { ratio, level } = useContextValue();
  const filled = Math.min(Math.max(ratio ?? 0, 0), 1);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0 -rotate-90", LEVEL_TEXT[level], className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      {filled > 0 ? (
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled)}
          className="transition-[stroke-dashoffset] duration-150 ease-out-quint"
        />
      ) : null}
    </svg>
  );
}

/** Trigger label: the share of the window, or the raw count when its size is unknown. */
function ContextValue({ className, ...props }: React.ComponentProps<"span">) {
  const { usedTokens, ratio, isApproximate } = useContextValue();

  if (usedTokens === null) {
    return null;
  }

  return (
    <span className={cn("tabular-nums", className)} {...props}>
      {isApproximate ? "~" : null}
      {ratio === null ? formatTokens(usedTokens) : formatPercent(ratio)}
    </span>
  );
}

function ContextTrigger({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const { usedTokens, maxTokens, ratio } = useContextValue();
  const label =
    usedTokens === null
      ? "Context usage"
      : ratio === null
        ? `Context usage: ${formatTokens(usedTokens)} tokens`
        : `Context usage: ${formatPercent(ratio)} of ${formatTokens(maxTokens ?? 0)} tokens`;

  return (
    <PopoverTrigger
      openOnHover
      delay={150}
      closeDelay={100}
      render={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label}
          className={cn("gap-1.5 px-1.5 text-xs font-normal text-muted-foreground", className)}
          {...props}
        />
      }
    >
      {children ?? (
        <>
          <ContextValue />
          <ContextIcon />
        </>
      )}
    </PopoverTrigger>
  );
}

function ContextContent({ className, ...props }: React.ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      side="top"
      align="end"
      className={cn("w-64 gap-0 divide-y divide-separator p-0 text-xs", className)}
      {...props}
    />
  );
}

function ContextContentHeader({ children, className, ...props }: React.ComponentProps<"div">) {
  const { usedTokens, maxTokens, ratio, level, isApproximate } = useContextValue();

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium text-foreground">
              {ratio === null
                ? "Context"
                : `${isApproximate ? "~" : ""}${formatPercent(ratio)} used`}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {usedTokens === null ? "—" : formatTokens(usedTokens)}
              {" / "}
              {maxTokens === null ? "?" : formatTokens(maxTokens)}
            </span>
          </div>
          <Meter value={Math.min((ratio ?? 0) * 100, 100)} aria-label="Context window used">
            <MeterTrack className="h-1 rounded-full bg-hover">
              <MeterIndicator
                className={cn(
                  "rounded-full duration-150 ease-out-quint",
                  level === "normal" ? "bg-muted-foreground" : null,
                  level === "warning" ? "bg-warning" : null,
                  level === "critical" ? "bg-danger" : null,
                )}
              />
            </MeterTrack>
          </Meter>
        </>
      )}
    </div>
  );
}

function ContextContentBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-3", className)} {...props} />;
}

function ContextContentFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center justify-between gap-3 p-3", className)} {...props} />
  );
}

function ContextUsageRow({
  label,
  tokens,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  tokens: number | null | undefined;
  hint?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)} {...props}>
      <span className="text-muted-foreground">
        {label}
        {hint ? <span className="text-muted-foreground/60"> · {hint}</span> : null}
      </span>
      <span className="font-mono text-foreground tabular-nums">
        {typeof tokens === "number" ? formatTokens(tokens) : "—"}
      </span>
    </div>
  );
}

const compactTokens = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatTokens(value: number): string {
  return compactTokens.format(value);
}

function formatPercent(ratio: number): string {
  if (ratio > 0 && ratio < 0.01) {
    return "<1%";
  }

  return `${Math.round(ratio * 100)}%`;
}

export {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextIcon,
  ContextTrigger,
  ContextUsageRow,
  ContextValue,
  formatTokens,
};
