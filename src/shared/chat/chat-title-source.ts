const USER_SLICE = 350;
const LATEST_USER_SLICE = 250;
const ASSISTANT_SLICE = 200;
const EARLY_USER_COUNT = 3;
export const CHAT_TITLE_PACK_MAX_LENGTH = 2_000;

export interface ChatTitleMessage {
  role: string;
  text: string;
}

function humanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/```[\s\S]*$/g, " ")
    .replace(/~~~[\s\S]*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildChatTitleSource(messages: readonly ChatTitleMessage[]): string | null {
  const users = messages
    .filter((message) => message.role === "user")
    .map((message) => humanText(message.text))
    .filter(Boolean);
  const assistant = messages
    .filter((message) => message.role === "assistant")
    .map((message) => humanText(message.text))
    .find(Boolean);

  if (users.length === 0 && !assistant) return null;

  const lines = users
    .slice(0, EARLY_USER_COUNT)
    .map((text) => `User: ${text.slice(0, USER_SLICE)}`);
  const latest = users.length > EARLY_USER_COUNT ? users[users.length - 1] : undefined;
  if (latest) {
    lines.push(`Latest user: ${latest.slice(0, LATEST_USER_SLICE)}`);
  }
  if (assistant) {
    lines.push(`Assistant: ${assistant.slice(0, ASSISTANT_SLICE)}`);
  }

  const packed = lines.join("\n").slice(0, CHAT_TITLE_PACK_MAX_LENGTH);
  return packed.length > 0 ? packed : null;
}

export function firstUserTitleLine(messages: readonly ChatTitleMessage[]): string | null {
  const first = messages.find((message) => message.role === "user");
  if (!first) return null;
  const line = humanText(first.text);
  return line.length > 0 ? line : null;
}
