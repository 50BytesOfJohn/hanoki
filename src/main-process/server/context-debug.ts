import { appendFileSync } from "node:fs";

import type { ModelMessage } from "ai";

/**
 * Opt-in dump of exactly what a model is sent, for checking context by hand.
 *
 * - `HANOKI_DEBUG_CONTEXT=1` logs a compact outline of every request (roles,
 *   sizes and the start and end of each turn) to the console.
 * - `HANOKI_DEBUG_CONTEXT=/path/file.jsonl` appends every full request to that
 *   file, one JSON object per line, and logs the outline too.
 *
 * Off by default: requests carry the user's whole conversation.
 */
const target = process.env.HANOKI_DEBUG_CONTEXT?.trim() ?? "";

export function isContextDebugEnabled(): boolean {
  return target.length > 0 && target !== "0";
}

export interface ModelRequestLog {
  /** Where the request comes from, e.g. `chat` or `workflow:Review`. */
  source: string;
  chatId: string;
  modelId: string;
  system: string | undefined;
  messages: readonly ModelMessage[];
  extra?: Record<string, unknown>;
}

export function logModelRequest(request: ModelRequestLog): void {
  if (!isContextDebugEnabled()) return;
  console.info(`[context] ${request.source} → ${request.modelId}\n${outlineRequest(request)}`);
  if (target === "1") return;
  try {
    appendFileSync(target, `${JSON.stringify({ at: new Date().toISOString(), ...request })}\n`);
  } catch (error) {
    console.warn("[context] Could not write the request log.", { target }, error);
  }
}

/** One line per turn: role, size, and where it starts and ends. */
export function outlineRequest({
  system,
  messages,
}: Pick<ModelRequestLog, "system" | "messages">): string {
  const lines: string[] = [];
  if (system) lines.push(`  system  ${describe(system)}`);
  for (const message of messages) {
    lines.push(`  ${message.role.padEnd(9)} ${describe(contentText(message))}`);
  }
  return lines.join("\n");
}

function contentText(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "reasoning") return `[reasoning ${part.text.length}]`;
      return `[${part.type}]`;
    })
    .join(" ");
}

function describe(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const head = flat.slice(0, 70);
  const tail = flat.length > 140 ? ` … ${flat.slice(-50)}` : flat.slice(70);
  return `(${text.length} chars) ${head}${tail}`;
}
