import { useState } from "react";

import { cn } from "../utils";

const brandIconUrls = import.meta.glob<string>(
  "../../../../node_modules/@lobehub/icons-static-svg/icons/*.svg",
  { eager: true, query: "?url", import: "default" },
);

const brandIconUrlByFile = new Map(
  Object.entries(brandIconUrls).map(([file, url]) => {
    const name = file.slice(file.lastIndexOf("/") + 1);
    return [name, url] as const;
  }),
);

/** Creator names that do not match their icon file once punctuation is dropped. */
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

export function brandIconUrl(slug: string, variant: "color" | "mono"): string | null {
  const file = variant === "color" ? `${slug}-color.svg` : `${slug}.svg`;
  return brandIconUrlByFile.get(file) ?? null;
}

export interface BrandIconProps {
  /** Creator as the provider reported it, e.g. "mistralai" or "x-ai". */
  creator: string | null | undefined;
  /** Shown when the creator has no logo — usually the model name. */
  fallbackLabel?: string;
  className?: string;
}

export function BrandIcon({ creator, fallbackLabel, className }: BrandIconProps) {
  const slug = getBrandIconSlug(creator);
  const colorUrl = slug ? brandIconUrl(slug, "color") : null;
  const monoUrl = slug ? brandIconUrl(slug, "mono") : null;
  const [variant, setVariant] = useState<"color" | "mono" | "none">("color");
  const [lastSlug, setLastSlug] = useState(slug);
  if (lastSlug !== slug) {
    setLastSlug(slug);
    setVariant("color");
  }

  const effective =
    !slug || variant === "none"
      ? "none"
      : variant === "color"
        ? colorUrl
          ? "color"
          : monoUrl
            ? "mono"
            : "none"
        : monoUrl
          ? "mono"
          : "none";
  const src = effective === "color" ? colorUrl : effective === "mono" ? monoUrl : null;

  if (!src) {
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
      key={`${slug}-${effective}`}
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={cn(
        "size-6 shrink-0 rounded-md object-contain",
        effective === "mono" && "dark:invert",
        className,
      )}
      onError={() => {
        setVariant(effective === "color" ? "mono" : "none");
      }}
    />
  );
}
