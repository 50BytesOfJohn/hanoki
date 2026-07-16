import type { ChatTitleUpdatedEvent } from "@shared/events";

import { applyChatTitleUpdate } from "./chat-title-events";

interface GenerateSumiChatTitleInput {
  apiUrl: string;
  chatId: string;
  sourcePrompt?: string;
}

const pendingGenerations = new Map<string, Promise<ChatTitleUpdatedEvent>>();

export function generateSumiChatTitle({
  apiUrl,
  chatId,
  sourcePrompt,
}: GenerateSumiChatTitleInput): Promise<ChatTitleUpdatedEvent> {
  const pending = pendingGenerations.get(chatId);
  if (pending) {
    return pending;
  }

  const generation = requestSumiChatTitle({ apiUrl, chatId, sourcePrompt });
  pendingGenerations.set(chatId, generation);
  const cleanup = () => {
    if (pendingGenerations.get(chatId) === generation) {
      pendingGenerations.delete(chatId);
    }
  };
  void generation.then(cleanup, cleanup);

  return generation;
}

async function requestSumiChatTitle({
  apiUrl,
  chatId,
  sourcePrompt,
}: GenerateSumiChatTitleInput): Promise<ChatTitleUpdatedEvent> {
  if (!apiUrl) {
    throw new Error("Sumi is not ready.");
  }

  const response = await fetch(`${apiUrl}/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      ...(sourcePrompt?.trim() ? { sourcePrompt: sourcePrompt.trim() } : {}),
    }),
  });

  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || "Sumi could not generate a chat title.");
  }

  const event = (await response.json()) as ChatTitleUpdatedEvent;
  applyChatTitleUpdate(event);
  return event;
}
