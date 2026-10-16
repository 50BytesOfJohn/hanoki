import { type } from "arktype";

import { parseTiptapDocument } from "../tiptap/document";
import type { ChatMessageMetadata, HanokiUiMessage } from "./message-metadata";

export const REVISION_NOTE_MAX_LENGTH = 2000;

/** `body.revision` of a `regenerate-message` request: regenerate with a note. */
export const chatRevisionRequestSchema = type({
  sourceMessageId: "string > 0",
  note: "string",
});

export type ChatRevisionRequest = typeof chatRevisionRequestSchema.infer;

export type ChatMessageRevision = NonNullable<ChatMessageMetadata["revision"]>;

/**
 * The visible text of an assistant message, as the model would read it back.
 * Reasoning, tool calls, step markers, and files are left out: the revision
 * turn replays only what the user saw and is commenting on.
 */
export function getRevisionSourceText(parts: readonly unknown[]): string {
  const texts: string[] = [];

  for (const part of parts as HanokiUiMessage["parts"]) {
    if (part.type === "text") {
      texts.push(part.text);
      continue;
    }
    if (part.type === "data-tiptap") {
      const parsed = parseTiptapDocument(part.data);
      if (parsed.ok) {
        texts.push(parsed.value.modelText);
      }
    }
  }

  return texts
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n")
    .trim();
}

export function buildRevisionPrompt(note: string): string {
  return [
    "Revise your previous response according to this note:",
    "",
    "<note>",
    note,
    "</note>",
    "",
    "Reply with the complete revised response as a drop-in replacement for the previous one.",
    "Keep everything the note does not ask to change (content, tone, language, formatting).",
    "Do not mention the note, the revision, or the previous version.",
  ].join("\n");
}

/**
 * Adds the previous response and the user's note to the model input as a
 * synthetic assistant + user turn. These turns only exist for this request:
 * they are never persisted, so the revision stays a plain sibling of the
 * message it revised.
 *
 * A fresh revision ends on the parent user message, so the turn is appended.
 * A tool-approval resume ends on the in-flight assistant message, so the turn
 * goes in front of it — that message is the answer to the note.
 */
export function insertRevisionTurn(
  messages: readonly HanokiUiMessage[],
  revision: ChatMessageRevision,
): HanokiUiMessage[] {
  const revisionTurn: HanokiUiMessage[] = [
    {
      id: `revision-draft:${revision.sourceMessageId}`,
      role: "assistant",
      parts: [{ type: "text", text: revision.sourceText, state: "done" }],
    },
    {
      id: `revision-note:${revision.sourceMessageId}`,
      role: "user",
      parts: [{ type: "text", text: buildRevisionPrompt(revision.note) }],
    },
  ];

  if (messages.at(-1)?.role === "assistant") {
    return [...messages.slice(0, -1), ...revisionTurn, ...messages.slice(-1)];
  }

  return [...messages, ...revisionTurn];
}
