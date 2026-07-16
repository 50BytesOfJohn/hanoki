import * as React from "react";

import { cn } from "@/lib/utils";
import { findOrbColor } from "@shared/workspace/workspace-orb-colors";
import "./workspace-orb.css";

/** Pixel sizes for the real call sites: inline dot, list icon, swatch, hero avatar. */
const ORB_SIZES = {
  xs: 10,
  sm: 18,
  md: 36,
  lg: 52,
} as const;

export type WorkspaceOrbSize = keyof typeof ORB_SIZES;

interface WorkspaceOrbProps extends Omit<React.ComponentProps<"span">, "color"> {
  /** Stored `workspace.color` hex; unknown/null falls back to the Ember variant. */
  color?: string | null;
  size?: WorkspaceOrbSize;
  /** Disable the hover animation, e.g. in a picker grid of many orbs. */
  static?: boolean;
}

/**
 * The workspace avatar: a CSS-only "Liquid Plasma" orb, recolored per workspace.
 * Static at rest; animates on hover of itself or an ancestor marked `group/orb`.
 */
export function WorkspaceOrb({
  color,
  size = "sm",
  static: isStatic,
  className,
  style,
  ...props
}: WorkspaceOrbProps) {
  const variant = findOrbColor(color);
  const filter = `hue-rotate(${variant.hueRotate}deg) saturate(${variant.saturate ?? 1}) brightness(${variant.brightness ?? 1})`;

  return (
    <span
      aria-hidden
      className={cn("orb-plasma", isStatic && "orb-plasma--static", className)}
      style={{ ["--orb-size" as string]: `${ORB_SIZES[size]}px`, filter, ...style }}
      {...props}
    />
  );
}
