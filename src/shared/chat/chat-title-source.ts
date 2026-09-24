import { ITEM_TITLE_SOURCE_MAX_LENGTH } from "@shared/markdown/title-source";

const USER_BUDGET = 1_200;
const ASSISTANT_BUDGET = 400;

export function buildChatTitleSource(
  messages: readonly { role: string; text: string }[],
): string | null {
  const users: string[] = [];
  const assistants: string[] = [];

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) continue;
    if (message.role === "user") users.push(text);
    else if (message.role === "assistant") assistants.push(text);
  }

  const lines: string[] = [];
  let userLength = 0;
  for (const text of users) {
    if (userLength >= USER_BUDGET) break;
    const line = `User: ${text}`.slice(0, USER_BUDGET - userLength);
    lines.push(line);
    userLength += line.length;
  }

  const assistant = assistants[0];
  if (assistant && lines.length < 4) {
    lines.push(`Assistant: ${assistant}`.slice(0, ASSISTANT_BUDGET));
  }

  if (lines.length === 0) return null;
  return lines.join("\n").slice(0, ITEM_TITLE_SOURCE_MAX_LENGTH);
}
