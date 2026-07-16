import { generateText } from "ai";
import { CHAT_TITLE_MAX_LENGTH, parseChatTitle } from "@shared/chat/chat-title";
import type { ChatTitleUpdatedEvent } from "@shared/events";
import type { SumiModelReference } from "@shared/ipc";
import { getChatById, updateChatTitle } from "../../chat-tree/repository";
import { listMessagesByChatId, type MessageRow } from "../../messages/repository";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { readSumiSettings } from "../../services/settings-service";
import { createLanguageModel } from "../providers/language-model-factory";
import { SUMI_CHAT_TITLE_INSTRUCTIONS } from "./features";

interface ResolvedSumiModel {
  providerId: string;
  providerModelId: string;
}

interface GenerateSumiChatTitleInput {
  chatId: string;
  sourcePrompt?: string | null;
}

const CHAT_TITLE_SOURCE_MAX_LENGTH = 8_000;
const pendingTitleGenerations = new Map<string, Promise<ChatTitleUpdatedEvent>>();

export function generateSumiChatTitle({
  chatId,
  sourcePrompt,
}: GenerateSumiChatTitleInput): Promise<ChatTitleUpdatedEvent> {
  const pending = pendingTitleGenerations.get(chatId);
  if (pending) {
    return pending;
  }

  const generation = generateChatTitle(chatId, sourcePrompt?.trim() || null);
  pendingTitleGenerations.set(chatId, generation);
  const cleanup = () => {
    if (pendingTitleGenerations.get(chatId) === generation) {
      pendingTitleGenerations.delete(chatId);
    }
  };
  void generation.then(cleanup, cleanup);

  return generation;
}

async function generateChatTitle(
  chatId: string,
  sourcePrompt: string | null,
): Promise<ChatTitleUpdatedEvent> {
  const settings = readSumiSettings();
  if (!settings.titleGeneration.enabled) {
    throw new Error("Sumi title generation is disabled.");
  }

  const modelTarget = resolveSumiModel(settings.titleGeneration.model);
  if (!modelTarget) {
    throw new Error("The configured Sumi title model is unavailable.");
  }

  const chat = getChatById(chatId);
  if (!chat) {
    throw new Error("Chat not found.");
  }

  const source = sourcePrompt ?? buildChatTitleSource(listMessagesByChatId(chat.id));
  if (!source) {
    throw new Error("Send a message before generating a chat title.");
  }

  const languageModel = createSumiLanguageModel(modelTarget);
  if (!languageModel) {
    throw new Error("The configured Sumi title model could not be started.");
  }

  const { text } = await generateText({
    model: languageModel,
    instructions: SUMI_CHAT_TITLE_INSTRUCTIONS,
    prompt: source,
    maxOutputTokens: 32,
  });
  const title = normalizeGeneratedChatTitle(text);
  const updatedChat = updateChatTitle(chat.id, title);

  return {
    type: "chat:title-updated",
    chatId: updatedChat.id,
    workspaceId: updatedChat.workspaceId,
    title: updatedChat.title,
  };
}

function buildChatTitleSource(messages: MessageRow[]): string | null {
  const lines: string[] = [];
  let length = 0;

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const text = extractMessageText(message).trim();
    if (!text) {
      continue;
    }

    const line = `${message.role === "user" ? "User" : "Assistant"}: ${text}`;
    const remaining = CHAT_TITLE_SOURCE_MAX_LENGTH - length;
    if (remaining <= 0) {
      break;
    }

    lines.push(line.slice(0, remaining));
    length += Math.min(line.length, remaining);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function extractMessageText(message: MessageRow): string {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as Record<string, unknown>).type === "text" &&
        typeof (part as Record<string, unknown>).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

function normalizeGeneratedChatTitle(input: string): string {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const normalized = (firstLine ?? "")
    .replace(/^(?:title|chat title)\s*:\s*/i, "")
    .replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/g, "")
    .replace(/[.!?。！？]+$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_TITLE_MAX_LENGTH);
  const parsedTitle = parseChatTitle(normalized);

  if (!parsedTitle.ok) {
    throw new Error("Sumi returned an invalid chat title.");
  }

  return parsedTitle.value;
}

function createSumiLanguageModel(modelTarget: ResolvedSumiModel) {
  const provider = getProviderById(modelTarget.providerId);
  if (!provider) {
    return null;
  }

  try {
    const providerRuntime = resolveProviderRuntimeContext(provider);
    return createLanguageModel({
      providerRow: provider,
      providerRuntime,
      providerModelId: modelTarget.providerModelId,
    });
  } catch {
    return null;
  }
}

function resolveSumiModel(configuredModel: SumiModelReference | null): ResolvedSumiModel | null {
  if (!configuredModel) {
    return null;
  }

  const storedModel = getModelById(
    `${configuredModel.providerId}:${configuredModel.providerModelId}`,
  );
  if (storedModel && storedModel.lifecycleStatus !== "active") {
    return null;
  }

  return {
    providerId: configuredModel.providerId,
    providerModelId: configuredModel.providerModelId,
  };
}
