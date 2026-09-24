const generatingChatIds = new Set<string>();
const pendingKickChatIds = new Set<string>();

export function isChatGenerationBusy(chatId: string): boolean {
  return generatingChatIds.has(chatId) || pendingKickChatIds.has(chatId);
}

/** Holds the target until its generation request starts, so a second kick is rejected. */
export function reserveChatKick(chatId: string): void {
  pendingKickChatIds.add(chatId);
}

export function beginChatGeneration(chatId: string): void {
  pendingKickChatIds.delete(chatId);
  generatingChatIds.add(chatId);
}

export function endChatGeneration(chatId: string): void {
  generatingChatIds.delete(chatId);
  pendingKickChatIds.delete(chatId);
}
