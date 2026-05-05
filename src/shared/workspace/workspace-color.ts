const WORKSPACE_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

type ParseWorkspaceColorResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: string;
    };

export function parseWorkspaceColor(input: unknown): ParseWorkspaceColorResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      error: "Workspace color must be a string.",
    };
  }

  const normalized = input.trim();
  if (!WORKSPACE_COLOR_HEX_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "Workspace color must be a hex value in the format #RRGGBB.",
    };
  }

  return {
    ok: true,
    value: normalized.toLowerCase(),
  };
}
