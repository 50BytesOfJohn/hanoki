import {
  normalizeChatMessageMetadata,
  type ChatMessageMetadata,
  type HanokiUiMessage,
} from "@shared/chat/message-metadata";

import { setChatCurrentBranch } from "../chat-tree/repository";
import { getMessageById, type MessageRow, upsertMessage } from "../messages/repository";

export function persistRequestUserMessage(
  chatId: string,
  requestMessages: readonly HanokiUiMessage[],
): MessageRow | null {
  const userMessage = requestMessages.at(-1);
  if (!userMessage || userMessage.role !== "user") {
    return null;
  }

  const existingMessage = getMessageById(userMessage.id);
  const previousRequestMessage = requestMessages.at(-2);
  const parentId = existingMessage
    ? existingMessage.parentId
    : (previousRequestMessage?.id ?? normalizeChatMessageMetadata(userMessage.metadata).parentId);

  return upsertMessage({
    id: userMessage.id,
    chatId,
    parentId,
    role: "user",
    parts: userMessage.parts,
    metadata: {
      ...existingMessage?.metadata,
      parentId,
    },
  });
}

export function persistGeneratedAssistantMessage({
  chatId,
  message,
  fallbackParentId,
  responseMetadata,
  modelId,
}: {
  chatId: string;
  message: HanokiUiMessage;
  fallbackParentId: string | null;
  responseMetadata: Omit<ChatMessageMetadata, "parentId"> | undefined;
  modelId: string;
}): MessageRow {
  const existingMessage = getMessageById(message.id);
  const parentId = normalizeChatMessageMetadata(message.metadata, fallbackParentId).parentId;
  const savedMessage = upsertMessage({
    id: message.id,
    chatId,
    parentId,
    role: "assistant",
    parts: message.parts,
    metadata: {
      ...existingMessage?.metadata,
      parentId,
      ...responseMetadata,
    },
  });

  setChatCurrentBranch(chatId, savedMessage.id, {
    settingsPatch: {
      modelId,
    },
  });

  return savedMessage;
}
