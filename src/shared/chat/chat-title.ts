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

const GENERATED_TITLE_LABEL = /^(?:title|chat title|document title|heading)\s*:\s*/i;

export function normalizeGeneratedTitle(input: string): string {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const normalized = (firstLine ?? "")
    .replace(/^#{1,6}\s+/, "")
    .replace(GENERATED_TITLE_LABEL, "")
    .replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/g, "")
    .replace(/[.!?。！？]+$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_TITLE_MAX_LENGTH);
  const parsedTitle = parseChatTitle(normalized);

  if (!parsedTitle.ok) {
    throw new Error("Sumi returned an invalid item title.");
  }

  return parsedTitle.value;
}
