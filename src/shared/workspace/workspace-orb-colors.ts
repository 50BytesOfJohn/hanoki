export interface WorkspaceOrbColor {
  /** Stored `workspace.color` value, a plain `#RRGGBB` hex. */
  hex: string;
  label: string;
  /** Degrees fed to `hue-rotate()` to recolor the single plasma design. */
  hueRotate: number;
  /** Optional `saturate()` multiplier when a straight rotation looks muddy. */
  saturate?: number;
  /** Optional `brightness()` multiplier. */
  brightness?: number;
}

/**
 * Eight workspace orb variants, all recolored from one plasma gradient design
 * via `hue-rotate()`. Rotation 0 is the source palette (warm ember/magenta).
 * The stored `workspace.color` hex maps to a variant via {@link findOrbColor}.
 */
export const WORKSPACE_ORB_COLORS: readonly WorkspaceOrbColor[] = [
  { hex: "#e0603a", label: "Ember", hueRotate: 0 },
  { hex: "#cf9a3a", label: "Gold", hueRotate: 45, saturate: 1.05 },
  { hex: "#3fae63", label: "Emerald", hueRotate: 115 },
  { hex: "#2fa9a0", label: "Teal", hueRotate: 150 },
  { hex: "#4a82e6", label: "Azure", hueRotate: 200 },
  { hex: "#7d5ae0", label: "Violet", hueRotate: 250 },
  { hex: "#d64f92", label: "Rose", hueRotate: 310 },
  { hex: "#7c8591", label: "Slate", hueRotate: 200, saturate: 0.35, brightness: 1.05 },
];

/** Maps a stored hex to its variant; unknown/legacy hexes fall back to Ember (rotate 0). */
export function findOrbColor(hex?: string | null): WorkspaceOrbColor {
  const normalized = hex?.trim().toLowerCase();
  return (
    WORKSPACE_ORB_COLORS.find((c) => c.hex.toLowerCase() === normalized) ?? WORKSPACE_ORB_COLORS[0]
  );
}
