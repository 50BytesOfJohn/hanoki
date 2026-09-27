export const ATTACHED_ITEM_KINDS = ["note", "chat"] as const;

export type AttachedItemKind = (typeof ATTACHED_ITEM_KINDS)[number];

/** Pointer stored on the chat. Bodies are loaded later by readNote / readChat. */
export interface AttachedItemRef {
  kind: AttachedItemKind;
  itemId: string;
}

export interface AttachedItemPointer extends AttachedItemRef {
  title: string | null;
}

/** Per-read ceiling for note and chat bodies. Stored notes can be up to 5 MiB. */
export const HANOKI_READ_CHAR_CEILING = 16_000;

export const MAX_ATTACHED_ITEMS = 32;

export function isAttachedItemKind(value: unknown): value is AttachedItemKind {
  return value === "note" || value === "chat";
}

export function isAttachedItemRef(value: unknown): value is AttachedItemRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    isAttachedItemKind(record.kind) && typeof record.itemId === "string" && record.itemId.length > 0
  );
}

/** Drops tool ids, terminals, and anything that is not `{ kind: "note" | "chat", itemId }`. */
export function normalizeAttachedItemIds(value: unknown): AttachedItemRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: AttachedItemRef[] = [];
  for (const entry of value) {
    if (!isAttachedItemRef(entry)) continue;
    const key = `${entry.kind}:${entry.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: entry.kind, itemId: entry.itemId });
    if (items.length >= MAX_ATTACHED_ITEMS) break;
  }
  return items;
}

export function parseAttachedItemIdsUpdate(value: unknown): AttachedItemRef[] {
  if (!Array.isArray(value)) {
    throw new Error("attachedItemIds must be an array.");
  }
  if (value.length > MAX_ATTACHED_ITEMS) {
    throw new Error(`attachedItemIds accepts at most ${MAX_ATTACHED_ITEMS} items.`);
  }
  for (const entry of value) {
    if (!isAttachedItemRef(entry)) {
      throw new Error('attachedItemIds entries must be { kind: "note" | "chat", itemId: string }.');
    }
  }
  return normalizeAttachedItemIds(value);
}

export function formatAttachedContextInstructions(
  items: readonly AttachedItemPointer[],
): string | null {
  if (items.length === 0) return null;
  const lines = items.map((item) => {
    const title = item.title === null ? "null (missing)" : JSON.stringify(item.title);
    return `- kind: ${item.kind}, itemId: ${item.itemId}, title: ${title}`;
  });
  return [
    "Attached context items for this turn. These are pointers only; bodies are not included.",
    "Call readNote for a note or readChat for a chat when you need its body. Do not read every attached item on every turn.",
    `readNote and readChat each return at most ${HANOKI_READ_CHAR_CEILING} characters and append a truncation marker when the source is longer.`,
    "readChat also returns at most 100 messages per call. Walk older history by passing beforeMessageId from the previous result's nextBeforeMessageId until it is null.",
    "readChat refuses the chat that is hosting this turn.",
    ...lines,
  ].join("\n");
}
