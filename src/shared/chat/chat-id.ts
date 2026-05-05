import { parseUuidV7 } from "../uuidv7";

type ParseChatIdResult = ReturnType<typeof parseUuidV7>;

export function parseChatId(input: unknown): ParseChatIdResult {
  return parseUuidV7(input, "Chat ID");
}
