import { parseUuidV7 } from "../uuidv7";

type ParseFolderIdResult = ReturnType<typeof parseUuidV7>;

export function parseFolderId(input: unknown): ParseFolderIdResult {
  return parseUuidV7(input, "Folder ID");
}
