import type { ItemTitleUpdatedEvent } from "@shared/events";

import { applyItemTitleUpdate } from "./item-title-events";

interface GenerateSumiItemTitleInput {
  apiUrl: string;
  itemId: string;
  sourcePrompt?: string;
}

interface SumiItemTitleRequest {
  itemId: string;
  sourcePrompt?: string;
}

const pendingGenerations = new Map<string, Promise<ItemTitleUpdatedEvent>>();

export function generateSumiItemTitle({
  apiUrl,
  itemId,
  sourcePrompt,
}: GenerateSumiItemTitleInput): Promise<ItemTitleUpdatedEvent> {
  const pending = pendingGenerations.get(itemId);
  if (pending) return pending;

  const generation = requestSumiItemTitle({ apiUrl, itemId, sourcePrompt });
  pendingGenerations.set(itemId, generation);
  const cleanup = () => {
    if (pendingGenerations.get(itemId) === generation) pendingGenerations.delete(itemId);
  };
  void generation.then(cleanup, cleanup);
  return generation;
}

async function requestSumiItemTitle({
  apiUrl,
  itemId,
  sourcePrompt,
}: GenerateSumiItemTitleInput): Promise<ItemTitleUpdatedEvent> {
  if (!apiUrl) throw new Error("Sumi is not ready.");

  const body: SumiItemTitleRequest = { itemId };
  if (sourcePrompt?.trim()) body.sourcePrompt = sourcePrompt.trim();

  const response = await fetch(`${apiUrl}/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || "Sumi could not generate an item title.");
  }

  const event: ItemTitleUpdatedEvent = await response.json();
  applyItemTitleUpdate(event);
  return event;
}
