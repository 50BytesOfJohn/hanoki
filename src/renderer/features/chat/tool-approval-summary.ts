const KIND_ORDER = ["chat", "markdown", "terminal", "folder"] as const;

const KIND_NOUN = {
  chat: { one: "chat", many: "chats", title: "chat" },
  markdown: { one: "note", many: "notes", title: "note" },
  terminal: { one: "terminal", many: "terminals", title: "terminal" },
  folder: { one: "folder", many: "folders", title: "folder" },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isKnownKind(kind: string): kind is (typeof KIND_ORDER)[number] {
  return kind === "chat" || kind === "markdown" || kind === "terminal" || kind === "folder";
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return "items";
  if (parts.length === 1) return parts[0] ?? "items";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function formatHanokiKindCounts(kinds: readonly string[]): string {
  const counts = { chat: 0, markdown: 0, terminal: 0, folder: 0 };
  for (const kind of kinds) {
    if (isKnownKind(kind)) counts[kind] += 1;
  }
  const parts: string[] = [];
  for (const kind of KIND_ORDER) {
    const count = counts[kind];
    if (count === 0) continue;
    const noun = KIND_NOUN[kind];
    parts.push(`${count} ${count === 1 ? noun.one : noun.many}`);
  }
  return joinList(parts);
}

export function formatHanokiMoveApproval(
  input: unknown,
  folderName: string | null,
): { title: string; summary: string; destination: string } {
  const items = isRecord(input) && Array.isArray(input.items) ? input.items : [];
  const kinds = items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const kind = readString(item.kind);
    return kind ? [kind] : [];
  });
  const count = kinds.length;
  const destinationFolderId = isRecord(input) ? input.destinationFolderId : undefined;
  const isRoot =
    destinationFolderId === null || destinationFolderId === "" || destinationFolderId === undefined;
  return {
    title: count === 1 ? "Move this Hanoki item?" : "Move these Hanoki items?",
    summary: formatHanokiKindCounts(kinds),
    destination: isRoot ? "the workspace root" : folderName ? `“${folderName}”` : "a folder",
  };
}

export function formatHanokiRenameApproval(
  input: unknown,
  currentName: string | null,
): { title: string; kindLabel: string; before: string | null; after: string | null } {
  const kind = isRecord(input) ? readString(input.kind) : null;
  const after = isRecord(input) ? readString(input.newName) : null;
  const kindLabel = kind && isKnownKind(kind) ? KIND_NOUN[kind].title : "item";
  return {
    title: `Rename this ${kindLabel}?`,
    kindLabel,
    before: currentName,
    after,
  };
}
