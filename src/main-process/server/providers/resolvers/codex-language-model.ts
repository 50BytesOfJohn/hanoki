/**
 * Language model resolver for the Codex (ChatGPT login) provider.
 *
 * The ChatGPT backend speaks the Responses API, so the standard OpenAI provider
 * works once the request is pointed at it and reshaped: the backend is stateless
 * (`store: false`), streams only, owns the `instructions` field, and rejects a
 * handful of parameters the public API accepts.
 */
import { randomUUID } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { getCodexCredentials } from "../../../providers/codex-auth";
import {
  buildCodexRequestHeaders,
  getCodexModel,
  CODEX_BASE_URL,
  type CodexModelDefinition,
} from "../../../providers/codex-models";
import type { LanguageModelResolver } from "../language-model-types";

export const createCodexLanguageModel: LanguageModelResolver = async ({ providerModelId }) => {
  const openai = createOpenAI({
    baseURL: CODEX_BASE_URL,
    // ponytail: unused placeholder, codexFetch replaces the Authorization header.
    apiKey: "codex-oauth",
    fetch: codexFetch,
  });

  return openai.responses(providerModelId);
};

const codexFetch: typeof fetch = async (input, init) => {
  if (!init?.body || typeof init.body !== "string") {
    throw new Error("Codex requests must have a JSON body.");
  }

  const credentials = await getCodexCredentials();
  const requestedBody = JSON.parse(init.body) as Record<string, unknown>;
  const model = await getCodexModel(credentials, String(requestedBody.model ?? ""));
  // The provider omits `stream` entirely for non-streaming calls.
  const streamRequested = requestedBody.stream === true;

  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(
    buildCodexRequestHeaders(credentials, {
      "OpenAI-Beta": "responses=experimental",
      "Content-Type": "application/json",
      session_id: randomUUID(),
    }),
  )) {
    headers.set(name, value);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    body: JSON.stringify(buildCodexRequestBody(requestedBody, model)),
  });

  if (streamRequested || !response.ok) {
    return response;
  }

  return collapseCodexStreamToJson(response);
};

/**
 * Reshapes an AI SDK Responses request into what the ChatGPT backend accepts.
 *
 * The caller's own system prompt cannot stay in `instructions` (the backend only
 * accepts its own), so it is moved to the front of the conversation as a
 * developer message instead.
 */
export function buildCodexRequestBody(
  body: Record<string, unknown>,
  model: CodexModelDefinition,
): Record<string, unknown> {
  const {
    instructions: callerInstructions,
    input: rawInput,
    include: rawInclude,
    reasoning: rawReasoning,
    // Dropped: the ChatGPT backend rejects or ignores these.
    temperature: _temperature,
    top_p: _topP,
    max_output_tokens: _maxOutputTokens,
    metadata: _metadata,
    service_tier: _serviceTier,
    truncation: _truncation,
    previous_response_id: _previousResponseId,
    ...rest
  } = body;

  const input = normalizeCodexInput(rawInput);
  if (typeof callerInstructions === "string" && callerInstructions.trim()) {
    input.unshift({
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: callerInstructions.trim() }],
    });
  }

  const reasoning = (rawReasoning ?? {}) as { effort?: unknown; summary?: unknown };

  return {
    ...rest,
    input,
    instructions: model.instructions,
    // Stateless mode is mandatory here; reasoning continuity rides along in the
    // encrypted reasoning items instead of server-side state.
    store: false,
    stream: true,
    include: withEncryptedReasoning(rawInclude),
    reasoning: {
      effort: reasoning.effort ?? model.defaultReasoningEffort ?? "medium",
      summary: reasoning.summary ?? "auto",
    },
  };
}

function normalizeCodexInput(rawInput: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rawInput)) {
    return [];
  }

  const input: Record<string, unknown>[] = [];

  for (const rawItem of rawInput) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      continue;
    }

    // `item_reference` points at server-side state that does not exist with store: false.
    const { id: _id, ...item } = rawItem as Record<string, unknown>;
    if (item.type === "item_reference") {
      continue;
    }

    input.push(item);
  }

  return input;
}

function withEncryptedReasoning(rawInclude: unknown): string[] {
  const include = Array.isArray(rawInclude)
    ? rawInclude.filter((entry): entry is string => typeof entry === "string")
    : [];

  return include.includes("reasoning.encrypted_content")
    ? include
    : [...include, "reasoning.encrypted_content"];
}

/**
 * The backend only streams, so non-streaming callers (title generation, Sumi)
 * get the final response rebuilt from the SSE stream.
 *
 * Unlike the public Responses API, the `response.completed` event here carries an
 * empty `output`; the items arrive as separate `response.output_item.done` events.
 */
export function collapseCodexStream(body: string): Record<string, unknown> {
  let completedResponse: Record<string, unknown> | null = null;
  const outputItemsByIndex = new Map<number, unknown>();

  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    let event: { type?: unknown; response?: unknown; item?: unknown; output_index?: unknown };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      continue;
    }

    if (event.type === "response.completed" && event.response) {
      completedResponse = event.response as Record<string, unknown>;
      continue;
    }

    if (event.type === "response.output_item.done" && event.item) {
      outputItemsByIndex.set(
        typeof event.output_index === "number" ? event.output_index : outputItemsByIndex.size,
        event.item,
      );
    }
  }

  if (!completedResponse) {
    throw new Error("Codex stream ended without a completed response.");
  }

  const output = [...outputItemsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item);

  return { ...completedResponse, output };
}

async function collapseCodexStreamToJson(response: Response): Promise<Response> {
  return new Response(JSON.stringify(collapseCodexStream(await response.text())), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
