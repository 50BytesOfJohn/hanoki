import { type } from "arktype";

export const CHAT_TITLE_MAX_LENGTH = 256;

export const chatTitleSchema = type(`string >= 1 & string <= ${CHAT_TITLE_MAX_LENGTH}`);

type ParseChatTitleResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: string;
    };

export function parseChatTitle(input: unknown): ParseChatTitleResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      error: "Chat title must be a string.",
    };
  }

  const normalized = input.trim();
  const parsed = chatTitleSchema(normalized);

  if (parsed instanceof type.errors) {
    return {
      ok: false,
      error: parsed[0]?.message ?? "Chat title is invalid.",
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}
