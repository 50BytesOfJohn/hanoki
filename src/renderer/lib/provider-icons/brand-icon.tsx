import { useMemo, useState } from "react";

import { cn } from "../utils";

/**
 * Model-creator logos, served from the LobeHub static icon set on unpkg —
 * the same remote-SVG approach the provider icons already use, but keyed on
 * whatever creator string the provider reported ("mistralai", "x-ai", …).
 *
 * Colored logos are preferred; the mono ones are `fill="currentColor"` SVGs
 * that render black inside an `<img>`, so they get inverted for the dark UI.
 * Anything LobeHub does not carry falls back to an initial.
 */

const ICON_SET_VERSION = "1.94.0";

/** Creator names that do not match their LobeHub slug once punctuation is dropped. */
const SLUG_ALIASES = new Map([
  ["allenai", "ai2"],
  ["amazon", "aws"],
  ["arceeai", "arcee"],
  ["bytedanceseed", "bytedance"],
  ["codex", "openai"],
  ["deepseekai", "deepseek"],
  ["ibmgranite", "ibm"],
  ["metallama", "meta"],
  ["mistralai", "mistral"],
  ["moonshotai", "moonshot"],
  ["zaiorg", "zai"],
]);

export function getBrandIconSlug(creator: string | null | undefined): string | null {
  if (!creator) {
    return null;
  }

  const normalized = creator.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) {
    return null;
  }

  return SLUG_ALIASES.get(normalized) ?? normalized;
}

function buildIconUrl(slug: string, variant: "color" | "mono"): string {
  const file = variant === "color" ? `${slug}-color` : slug;
  return `https://unpkg.com/@lobehub/icons-static-svg@${ICON_SET_VERSION}/icons/${file}.svg`;
}

export interface BrandIconProps {
  /** Creator as the provider reported it, e.g. "mistralai" or "x-ai". */
  creator: string | null | undefined;
  /** Shown when the creator has no logo — usually the model name. */
  fallbackLabel?: string;
  className?: string;
}

export function BrandIcon({ creator, fallbackLabel, className }: BrandIconProps) {
  const slug = useMemo(() => getBrandIconSlug(creator), [creator]);
  const [variant, setVariant] = useState<"color" | "mono" | "none">("color");

  // A different creator means a different logo — restart the color→mono→initial walk.
  const [lastSlug, setLastSlug] = useState(slug);
  if (lastSlug !== slug) {
    setLastSlug(slug);
    setVariant("color");
  }

  if (!slug || variant === "none") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-6 shrink-0 select-none items-center justify-center rounded-md bg-surface-tertiary text-[11px] font-semibold text-muted-foreground uppercase",
          className,
        )}
      >
        {(fallbackLabel ?? creator ?? "?").trim().charAt(0) || "?"}
      </span>
    );
  }

  return (
    <img
      key={`${slug}-${variant}`}
      src={buildIconUrl(slug, variant)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={cn(
        "size-6 shrink-0 rounded-md object-contain",
        variant === "mono" && "dark:invert",
        className,
      )}
      onError={() => {
        setVariant(variant === "color" ? "mono" : "none");
      }}
    />
  );
}
