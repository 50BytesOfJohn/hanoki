import { parseUuidV7 } from "../uuidv7";

export const DEFAULT_WORKSPACE_ID = "0-default";

type ParseWorkspaceIdResult = ReturnType<typeof parseUuidV7>;

export function parseWorkspaceId(input: unknown): ParseWorkspaceIdResult {
  if (input === DEFAULT_WORKSPACE_ID) {
    return {
      ok: true,
      value: DEFAULT_WORKSPACE_ID,
    };
  }

  return parseUuidV7(input, "Workspace ID");
}
