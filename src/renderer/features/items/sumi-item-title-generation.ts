import type { ItemTitleUpdatedEvent } from "@shared/events";

import { applyItemTitleUpdate } from "./item-title-events";

interface GenerateSumiItemTitleInput {
  apiUrl: string;
  itemId: string;
  sourcePrompt?: string;
  mode?: "auto" | "explicit";
}

interface SumiItemTitleRequest {
  itemId: string;
  sourcePrompt?: string;
  mode?: "auto" | "explicit";
}

const pendingGenerations = new Map<string, Promise<ItemTitleUpdatedEvent | null>>();

function pendingTitleKey(itemId: string, mode: "auto" | "explicit"): string {
  return `${itemId}:${mode}`;
}

export function generateSumiItemTitle({
  apiUrl,
  itemId,
  sourcePrompt,
  mode = "explicit",
}: GenerateSumiItemTitleInput): Promise<ItemTitleUpdatedEvent | null> {
  const key = pendingTitleKey(itemId, mode);
  const pending = pendingGenerations.get(key);
  if (pending) return pending;

  const generation = requestSumiItemTitle({ apiUrl, itemId, sourcePrompt, mode });
  pendingGenerations.set(key, generation);
  const cleanup = () => {
    if (pendingGenerations.get(key) === generation) pendingGenerations.delete(key);
  };
  void generation.then(cleanup, cleanup);
  return generation;
}

async function requestSumiItemTitle({
  apiUrl,
  itemId,
  sourcePrompt,
  mode = "explicit",
}: GenerateSumiItemTitleInput): Promise<ItemTitleUpdatedEvent | null> {
  if (!apiUrl) throw new Error("Sumi is not ready.");

  const body: SumiItemTitleRequest = { itemId, mode };
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

  if (response.status === 204) return null;

  const event: ItemTitleUpdatedEvent = await response.json();
  applyItemTitleUpdate(event);
  return event;
}
