import { type } from "arktype";

export const FOLDER_NAME_MAX_LENGTH = 128;

export const folderNameSchema = type(`string >= 1 & string <= ${FOLDER_NAME_MAX_LENGTH}`);

type ParseFolderNameResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: string;
    };

export function parseFolderName(input: unknown): ParseFolderNameResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      error: "Folder name must be a string.",
    };
  }

  const normalized = input.trim();
  const parsed = folderNameSchema(normalized);

  if (parsed instanceof type.errors) {
    return {
      ok: false,
      error: parsed[0]?.message ?? "Folder name is invalid.",
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}
