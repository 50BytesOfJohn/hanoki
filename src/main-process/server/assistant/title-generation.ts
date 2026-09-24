import { generateText } from "ai";
import { buildChatTitleSource } from "@shared/chat/chat-title-source";
import { normalizeGeneratedTitle } from "@shared/chat/chat-title";
import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { getTiptapMessageDisplayText } from "@shared/tiptap/extensions";
import type { ItemTitleUpdatedEvent } from "@shared/events";
import type { SumiModelReference } from "@shared/ipc";
import {
  buildMarkdownTitleSource,
  isReplaceableItemTitle,
  shouldCommitGeneratedTitle,
} from "@shared/markdown/title-source";
import { getChatTreeChildren, getItemById, updateItemTitle } from "../../chat-tree/repository";
import { listMessagesByChatId, type MessageRow } from "../../messages/repository";
import { getModelById } from "../../models/repository";
import { getProviderById } from "../../providers/repository";
import { resolveProviderRuntimeContext } from "../../providers/runtime-config";
import { readSumiSettings } from "../../services/settings-service";
import { createLanguageModel } from "../providers/language-model-factory";
import { SUMI_CHAT_TITLE_INSTRUCTIONS, SUMI_MARKDOWN_TITLE_INSTRUCTIONS } from "./features";

interface ResolvedSumiModel {
  providerId: string;
  providerModelId: string;
}

interface GenerateSumiItemTitleInput {
  itemId: string;
  sourcePrompt?: string | null;
  mode?: "auto" | "explicit";
}

const pendingTitleGenerations = new Map<string, Promise<ItemTitleUpdatedEvent | null>>();

function pendingTitleKey(itemId: string, mode: "auto" | "explicit"): string {
  return `${itemId}:${mode}`;
}

export function generateSumiItemTitle({
  itemId,
  sourcePrompt,
  mode = "explicit",
}: GenerateSumiItemTitleInput): Promise<ItemTitleUpdatedEvent | null> {
  const key = pendingTitleKey(itemId, mode);
  const pending = pendingTitleGenerations.get(key);
  if (pending) {
    return pending;
  }

  const generation = generateItemTitle(itemId, sourcePrompt?.trim() || null, mode);
  pendingTitleGenerations.set(key, generation);
  const cleanup = () => {
    if (pendingTitleGenerations.get(key) === generation) {
      pendingTitleGenerations.delete(key);
    }
  };
  void generation.then(cleanup, cleanup);

  return generation;
}

async function generateItemTitle(
  itemId: string,
  sourcePrompt: string | null,
  mode: "auto" | "explicit",
): Promise<ItemTitleUpdatedEvent | null> {
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

  const titleAtStart = item.title;
  if (mode === "auto" && !isReplaceableItemTitle(titleAtStart)) {
    return null;
  }

  const source = sourcePrompt
    ? `User: ${sourcePrompt}`
    : item.type === "chat"
      ? buildChatTitleSource(
          listMessagesByChatId(item.id).map((message) => ({
            role: message.role,
            text: extractMessageText(message),
          })),
        )
      : buildMarkdownItemTitleSource(item.workspaceId, item.folderId, item.id, item.data.markdown);
  if (!source) {
    throw new Error("Add content before generating a title.");
  }

  const languageModel = await createSumiLanguageModel(modelTarget);
  if (!languageModel) {
    throw new Error("The configured Sumi title model could not be started.");
  }

  const { text } = await generateText({
    model: languageModel,
    instructions:
      item.type === "chat" ? SUMI_CHAT_TITLE_INSTRUCTIONS : SUMI_MARKDOWN_TITLE_INSTRUCTIONS,
    prompt: source,
    temperature: 0.4,
    maxOutputTokens: 48,
  });
  const title = normalizeGeneratedTitle(text);
  const current = getItemById(item.id);
  if (!current || !shouldCommitGeneratedTitle(mode, titleAtStart, current.title)) {
    return null;
  }

  const updatedItem = updateItemTitle(item.id, title, titleAtStart);
  if (!updatedItem) return null;

  return {
    type: "item:title-updated",
    itemId: updatedItem.id,
    itemType: updatedItem.type,
    workspaceId: updatedItem.workspaceId,
    title: updatedItem.title,
  };
}

function buildMarkdownItemTitleSource(
  workspaceId: string,
  folderId: string | null,
  itemId: string,
  markdown: string,
): string | null {
  const source = buildMarkdownTitleSource(markdown);
  if (!source) return null;

  const siblings = getChatTreeChildren(workspaceId, folderId)
    .items.filter((sibling) => sibling.id !== itemId && sibling.type !== "terminal")
    .map((sibling) => sibling.title.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (siblings.length === 0) return source;

  return `Sibling titles:\n${siblings.map((title) => `- ${title}`).join("\n")}\n\n${source}`;
}

function extractMessageText(message: MessageRow): string {
  return getTiptapMessageDisplayText({
    parts: message.parts as HanokiUiMessage["parts"],
    role: message.role,
  });
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
