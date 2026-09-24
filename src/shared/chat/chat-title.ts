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

export const GENERATED_TITLE_MAX_LENGTH = 60;

const TRAILING_PUNCTUATION = /[.!?…,;:。！？]+$/u;
const FILENAME_UNSAFE = /[<>:"/\\|?*]/g;

export function sanitizeGeneratedTitle(
  input: string,
  kind: "chat" | "note" = "chat",
): string | null {
  let value = input.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "");
  if (kind === "note") {
    value = stripControls(value).replace(FILENAME_UNSAFE, "");
  }
  value = value
    .replace(/[`'"“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION, "")
    .trim()
    .slice(0, GENERATED_TITLE_MAX_LENGTH)
    .trim();
  const parsedTitle = parseChatTitle(value);
  return parsedTitle.ok ? parsedTitle.value : null;
}

export function titleFromModelText(input: string, kind: "chat" | "note"): string | null {
  const trimmed = input.trim();
  const jsonTitle = readJsonTitle(trimmed);
  const raw = jsonTitle ?? (trimmed.includes("{") ? null : trimmed);
  if (!raw) return null;
  return sanitizeGeneratedTitle(raw, kind);
}

function stripControls(value: string): string {
  let out = "";
  for (const char of value) {
    if (char.charCodeAt(0) >= 32) out += char;
  }
  return out;
}

function readJsonTitle(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { title?: unknown };
    return typeof parsed.title === "string" ? parsed.title : null;
  } catch {
    return null;
  }
}
