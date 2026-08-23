import { generateText } from "ai";
import { CHAT_TITLE_MAX_LENGTH, parseChatTitle } from "@shared/chat/chat-title";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { getTiptapMessageDisplayText } from "@shared/tiptap/extensions";
import type { ItemTitleUpdatedEvent } from "@shared/events";
import type { SumiModelReference } from "@shared/ipc";
import {
  buildMarkdownTitleSource,
  ITEM_TITLE_SOURCE_MAX_LENGTH,
} from "@shared/markdown/title-source";
import { getItemById, updateItemTitle } from "../../chat-tree/repository";
import { listMessagesByChatId, type MessageRow } from "../../messages/repository";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { readSumiSettings } from "../../services/settings-service";
import { createLanguageModel } from "../providers/language-model-factory";
import { SUMI_ITEM_TITLE_INSTRUCTIONS } from "./features";

interface ResolvedSumiModel {
  providerId: string;
  providerModelId: string;
}

interface GenerateSumiItemTitleInput {
  itemId: string;
  sourcePrompt?: string | null;
}

const pendingTitleGenerations = new Map<string, Promise<ItemTitleUpdatedEvent>>();

export function generateSumiItemTitle({
  itemId,
  sourcePrompt,
}: GenerateSumiItemTitleInput): Promise<ItemTitleUpdatedEvent> {
  const pending = pendingTitleGenerations.get(itemId);
  if (pending) {
    return pending;
  }

  const generation = generateItemTitle(itemId, sourcePrompt?.trim() || null);
  pendingTitleGenerations.set(itemId, generation);
  const cleanup = () => {
    if (pendingTitleGenerations.get(itemId) === generation) {
      pendingTitleGenerations.delete(itemId);
    }
  };
  void generation.then(cleanup, cleanup);

  return generation;
}

async function generateItemTitle(
  itemId: string,
  sourcePrompt: string | null,
): Promise<ItemTitleUpdatedEvent> {
  const settings = readSumiSettings();
  if (!settings.titleGeneration.enabled) {
    throw new Error("Sumi title generation is disabled.");
  }

  const modelTarget = resolveSumiModel(settings.titleGeneration.model);
  if (!modelTarget) {
    throw new Error("The configured Sumi title model is unavailable.");
  }

  const item = getItemById(itemId);
  if (!item || item.type === "terminal") {
    throw new Error("Item not found or unsupported.");
  }

  const source =
    sourcePrompt ??
    (item.type === "chat"
      ? buildChatTitleSource(listMessagesByChatId(item.id))
      : buildMarkdownTitleSource(item.data.markdown));
  if (!source) {
    throw new Error("Add content before generating a title.");
  }

  const languageModel = await createSumiLanguageModel(modelTarget);
  if (!languageModel) {
    throw new Error("The configured Sumi title model could not be started.");
  }

  const { text } = await generateText({
    model: languageModel,
    instructions: SUMI_ITEM_TITLE_INSTRUCTIONS,
    prompt: source,
    maxOutputTokens: 32,
  });
  const title = normalizeGeneratedItemTitle(text);
  const updatedItem = updateItemTitle(item.id, title);

  return {
    type: "item:title-updated",
    itemId: updatedItem.id,
    itemType: updatedItem.type,
    workspaceId: updatedItem.workspaceId,
    title: updatedItem.title,
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
    const remaining = ITEM_TITLE_SOURCE_MAX_LENGTH - length;
    if (remaining <= 0) {
      break;
    }

    lines.push(line.slice(0, remaining));
    length += Math.min(line.length, remaining);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function extractMessageText(message: MessageRow): string {
  return getTiptapMessageDisplayText({
    parts: message.parts as HanokiUiMessage["parts"],
    role: message.role,
  });
}

function normalizeGeneratedItemTitle(input: string): string {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const normalized = (firstLine ?? "")
    .replace(/^(?:title|chat title|document title)\s*:\s*/i, "")
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

async function createSumiLanguageModel(modelTarget: ResolvedSumiModel) {
  const provider = getProviderById(modelTarget.providerId);
  if (!provider) {
    return null;
  }

  try {
    const providerRuntime = resolveProviderRuntimeContext(provider);
    return await createLanguageModel({
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
