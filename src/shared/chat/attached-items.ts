export const ATTACHED_ITEM_KINDS = ["note", "chat"] as const;

export type AttachedItemKind = (typeof ATTACHED_ITEM_KINDS)[number];

/** Pointer from a TipTap item mention. Bodies are loaded later by readNote / readChat. */
export interface AttachedItemRef {
  kind: AttachedItemKind;
  itemId: string;
}

export interface AttachedItemPointer extends AttachedItemRef {
  title: string | null;
}

/** Per-read ceiling for note and chat bodies. Stored notes can be up to 5 MiB. */
export const HANOKI_READ_CHAR_CEILING = 16_000;

export function isAttachedItemKind(value: unknown): value is AttachedItemKind {
  return value === "note" || value === "chat";
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
    "Mentioned items for this turn. These are pointers only; bodies are not included.",
    "Call readNote for a note or readChat for a chat when you need its body. Do not read every mentioned item on every turn.",
    `readNote and readChat each return at most ${HANOKI_READ_CHAR_CEILING} characters and append a truncation marker when the source is longer.`,
    "readChat also returns at most 100 messages per call. Walk older history by passing beforeMessageId from the previous result's nextBeforeMessageId until it is null.",
    "readChat refuses the chat that is hosting this turn.",
    ...lines,
  ].join("\n");
}
