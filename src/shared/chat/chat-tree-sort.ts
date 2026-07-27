import type { ChatTreeFolderPlacement, ChatTreeSortOrder } from "../ipc";

export const DEFAULT_CHAT_TREE_SORT_ORDER: ChatTreeSortOrder = "name-asc";
export const DEFAULT_CHAT_TREE_FOLDER_PLACEMENT: ChatTreeFolderPlacement = "first";

export const CHAT_TREE_SORT_ORDERS = [
  { id: "name-asc", label: "Name (A → Z)" },
  { id: "name-desc", label: "Name (Z → A)" },
  { id: "updated-desc", label: "Last updated (newest first)" },
  { id: "updated-asc", label: "Last updated (oldest first)" },
  { id: "created-desc", label: "Date created (newest first)" },
  { id: "created-asc", label: "Date created (oldest first)" },
] as const satisfies readonly { id: ChatTreeSortOrder; label: string }[];

export const CHAT_TREE_FOLDER_PLACEMENTS = [
  { id: "first", label: "Folders first" },
  { id: "last", label: "Folders last" },
  { id: "mixed", label: "Mixed with chats" },
] as const satisfies readonly { id: ChatTreeFolderPlacement; label: string }[];

export function isChatTreeSortOrder(value: unknown): value is ChatTreeSortOrder {
  return CHAT_TREE_SORT_ORDERS.some((order) => order.id === value);
}

export function isChatTreeFolderPlacement(value: unknown): value is ChatTreeFolderPlacement {
  return CHAT_TREE_FOLDER_PLACEMENTS.some((placement) => placement.id === value);
}

export function getChatTreeSortOrderLabel(sortOrder: ChatTreeSortOrder): string {
  return CHAT_TREE_SORT_ORDERS.find((order) => order.id === sortOrder)?.label ?? "";
}

export interface SortableChatTreeItem {
  /** Folder name or chat title. */
  name: string;
  createdAt: number;
  updatedAt: number;
}

// Natural sort so "Chat 2" comes before "Chat 10", and case never decides order.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareItems(
  a: SortableChatTreeItem,
  b: SortableChatTreeItem,
  sortOrder: ChatTreeSortOrder,
): number {
  switch (sortOrder) {
    case "name-asc":
      return collator.compare(a.name, b.name);
    case "name-desc":
      return collator.compare(b.name, a.name);
    case "updated-desc":
      return b.updatedAt - a.updatedAt || collator.compare(a.name, b.name);
    case "updated-asc":
      return a.updatedAt - b.updatedAt || collator.compare(a.name, b.name);
    case "created-desc":
      return b.createdAt - a.createdAt || collator.compare(a.name, b.name);
    case "created-asc":
      return a.createdAt - b.createdAt || collator.compare(a.name, b.name);
  }
}

export interface ChatTreeSortEntry<T> {
  isFolder: boolean;
  key: SortableChatTreeItem;
  value: T;
}

/**
 * Orders one level of the chat tree. Folders and chats are compared by the same key;
 * `folderPlacement` decides whether they are grouped or interleaved.
 */
export function sortChatTreeEntries<T>(
  entries: readonly ChatTreeSortEntry<T>[],
  sortOrder: ChatTreeSortOrder,
  folderPlacement: ChatTreeFolderPlacement,
): T[] {
  const groupWeight = (entry: ChatTreeSortEntry<T>) => {
    if (folderPlacement === "mixed") return 0;
    const foldersFirst = folderPlacement === "first";
    return entry.isFolder === foldersFirst ? 0 : 1;
  };

  return [...entries]
    .sort((a, b) => groupWeight(a) - groupWeight(b) || compareItems(a.key, b.key, sortOrder))
    .map((entry) => entry.value);
}
