import { convertToModelMessages, type ModelMessage } from "ai";

import type { HanokiUiMessage } from "@shared/chat/message-metadata";
import { stripReplayedReasoning } from "@shared/chat/reasoning-replay";
import { parseTiptapDocument } from "@shared/tiptap/document";

import { mergeSameRoleTurns } from "@shared/chat/model-message-turns";

/**
 * Chat messages as a model reads them. Tiptap documents become their model
 * text, and a workflow's steps are left out: only its final message is chat
 * context. A message left with nothing (a run where every step failed or
 * none ran) is dropped rather than sent empty, and the user turns it sat
 * between are joined, since several providers reject two user turns in a row.
 * Only user turns are joined: assistant turns may carry tool calls and
 * reasoning that must stay as they are.
 */
export async function toModelMessages(
  messages: readonly HanokiUiMessage[],
): Promise<ModelMessage[]> {
  const contextMessages = messages.flatMap((message) => {
    const parts = message.parts.filter(
      (part) => part.type !== "data-workflowRun" && part.type !== "data-workflowStep",
    );
    if (parts.length === 0) return [];
    return parts.length === message.parts.length ? [message] : [{ ...message, parts }];
  });

  const modelMessages = stripReplayedReasoning(
    await convertToModelMessages<HanokiUiMessage>(contextMessages, {
      convertDataPart: (part) => {
        if (part.type !== "data-tiptap") {
          return undefined;
        }
        const parsed = parseTiptapDocument(part.data);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        return { type: "text", text: parsed.value.modelText };
      },
    }),
  );
  return mergeSameRoleTurns(modelMessages, ["user"]);
}
