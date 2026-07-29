import type { ChatStatus } from "ai";

/**
 * The activity state machine behind the toolbar indicator panel, kept free of the
 * stores it reads so it can be exercised on its own (see chat-activity.test.ts).
 *
 * "working" — the chat is streaming right now.
 * "unread"  — it finished (or failed) while the user was looking at something else.
 *
 * ponytail: "awaiting-approval" joins this union once tool approval exists — one more
 * branch in `applyChatStatus`, one more counter in the panel, nothing else moves.
 */
export type ChatActivityKind = "working" | "unread";

export type ChatActivityEntry = {
  chatId: string;
  /** Workspace the run belongs to, captured when it started — it may not be active anymore. */
  workspaceId: string;
  kind: ChatActivityKind;
  /** Start of the run while working, end of it once unread. */
  since: number;
  /** How the run ended. Only meaningful for "unread". */
  outcome: "running" | "done" | "error";
};

export type ChatActivityEntries = Readonly<Record<string, ChatActivityEntry>>;

export type ChatStatusEvent = {
  chatId: string;
  workspaceId: string;
  status: ChatStatus;
  /** Whether the chat is on screen right now — a reply the user watched arrive is never unread. */
  isVisible: boolean;
  at: number;
};

export function applyChatStatus(
  entries: ChatActivityEntries,
  { chatId, workspaceId, status, isVisible, at }: ChatStatusEvent,
): ChatActivityEntries {
  const existing = entries[chatId];

  if (status === "submitted" || status === "streaming") {
    if (existing?.kind === "working") return entries;
    return {
      ...entries,
      [chatId]: { chatId, workspaceId, kind: "working", since: at, outcome: "running" },
    };
  }

  // Only a run we saw start can finish. This also ignores the "ready" every chat
  // reports when it is first opened.
  if (existing?.kind !== "working") return entries;

  if (isVisible) return omit(entries, [chatId]);

  return {
    ...entries,
    [chatId]: {
      ...existing,
      kind: "unread",
      since: at,
      outcome: status === "error" ? "error" : "done",
    },
  };
}

/** Drops unread entries for the given chats. Working chats stay — they are still working. */
export function markRead(
  entries: ChatActivityEntries,
  chatIds: readonly string[],
): ChatActivityEntries {
  const read = chatIds.filter((chatId) => entries[chatId]?.kind === "unread");
  return read.length > 0 ? omit(entries, read) : entries;
}

/** Working chats first (longest running leading), then unread (most recent reply leading). */
export function sortActivity(entries: readonly ChatActivityEntry[]): ChatActivityEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "working" ? -1 : 1;
    return a.kind === "working" ? a.since - b.since : b.since - a.since;
  });
}

function omit(entries: ChatActivityEntries, chatIds: readonly string[]): ChatActivityEntries {
  return Object.fromEntries(
    Object.entries(entries).filter(([chatId]) => !chatIds.includes(chatId)),
  );
}
