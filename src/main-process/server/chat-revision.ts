import { type } from "arktype";
import { normalizeChatMessageMetadata, type HanokiUiMessage } from "@shared/chat/message-metadata";
import {
  getRevisionSourceText,
  REVISION_NOTE_MAX_LENGTH,
  type ChatMessageRevision,
  chatRevisionRequestSchema,
} from "@shared/chat/revision";

import { getMessageById } from "../messages/repository";

type ResolveRevisionContextResult =
  | { ok: true; revision: ChatMessageRevision | null }
  | { ok: false; error: string };

/**
 * Works out whether a chat request is a "regenerate with note" generation and,
 * if so, which previous response and note the model has to see.
 *
 * Fresh revisions arrive as `body.revision` on a `regenerate-message` request.
 * A tool-approval resume of a revision reads the context back from the
 * in-flight message's saved metadata (ignoring any re-sent `body.revision`),
 * so the model sees the same turn it answered before pausing.
 */
export function resolveRevisionContext({
  chat,
  body,
  messages,
  mode,
  responseParentId,
}: {
  chat: { id: string };
  body: Record<string, unknown>;
  messages: readonly HanokiUiMessage[];
  mode: "default" | "continue-message";
  responseParentId: string | null;
}): ResolveRevisionContextResult {
  const lastRequestMessage = messages.at(-1);
  const parsedRequest = chatRevisionRequestSchema(body.revision);
  const request = parsedRequest instanceof type.errors ? null : parsedRequest;

  // A tool-approval resume ends with the in-flight assistant message. When the
  // approval lands mid-stream, the SDK re-sends the original request body, so
  // `body.revision` may still be present; the saved metadata wins either way.
  const isApprovalResume = mode === "default" && lastRequestMessage?.role === "assistant";

  if (isApprovalResume || body.revision === undefined || body.revision === null) {
    if (!isApprovalResume) {
      return { ok: true, revision: null };
    }

    const saved = getMessageById(lastRequestMessage.id);
    const revision = saved
      ? normalizeChatMessageMetadata(saved.metadata).revision
      : lastRequestMessage.metadata?.revision;
    return { ok: true, revision: revision ?? null };
  }

  if (!request) {
    return { ok: false, error: "Revision request is invalid." };
  }

  if (
    mode !== "default" ||
    body.trigger !== "regenerate-message" ||
    lastRequestMessage?.role !== "user"
  ) {
    return { ok: false, error: "A revision can only be requested by regenerating a message." };
  }

  const note = request.note.trim();
  if (note.length === 0) {
    return { ok: false, error: "Revision note is required." };
  }
  if (note.length > REVISION_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Revision note must be at most ${REVISION_NOTE_MAX_LENGTH} characters.`,
    };
  }

  const source = getMessageById(request.sourceMessageId);
  if (source) {
    if (
      source.chatId !== chat.id ||
      source.role !== "assistant" ||
      source.parentId !== responseParentId
    ) {
      return { ok: false, error: "The message to revise does not belong to this conversation." };
    }

    const sourceText = getRevisionSourceText(source.parts);
    if (sourceText.length === 0) {
      return { ok: false, error: "The message to revise has no text." };
    }

    return {
      ok: true,
      revision: { sourceMessageId: source.id, note, sourceText },
    };
  }

  // The original was deleted, but the revision being regenerated still holds
  // a snapshot of its text.
  const previous = typeof body.messageId === "string" ? getMessageById(body.messageId) : null;
  const snapshot = previous ? normalizeChatMessageMetadata(previous.metadata).revision : undefined;
  if (
    previous &&
    previous.chatId === chat.id &&
    previous.parentId === responseParentId &&
    snapshot?.sourceMessageId === request.sourceMessageId &&
    snapshot.sourceText.length > 0
  ) {
    return {
      ok: true,
      revision: { sourceMessageId: request.sourceMessageId, note, sourceText: snapshot.sourceText },
    };
  }

  return { ok: false, error: "The original message is no longer available." };
}
