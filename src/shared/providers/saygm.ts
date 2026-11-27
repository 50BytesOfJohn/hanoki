/**
 * SayGM (saygm.com) is one key in front of OpenAI, Anthropic, Google and
 * open-weight hosts. Each catalog entry lists the wire formats it accepts
 * (`api_shapes`), and every format passes its native features straight
 * through, so a model is sent over the richest one it has:
 *
 * - `responses` (GPT, o-series): reasoning summaries come back.
 * - `messages` (Claude): adaptive thinking and thinking text come back.
 * - `streamGenerateContent` (Gemini): thinking levels apply, though the
 *   gateway keeps the thought text to itself.
 * - `chat.completions` (GLM, Qwen, Kimi, DeepSeek…): `reasoning_effort` in,
 *   `reasoning_content` out.
 */
import type { ReasoningEffort } from "../models/reasoning";

export type SayGmApiRoute = "responses" | "messages" | "gemini" | "chat";

export const SAYGM_API_ORIGIN = "https://api.saygm.com";

/** In order of preference. Image, video and non-streaming Gemini shapes can't hold a chat. */
const ROUTES_BY_SHAPE: ReadonlyArray<readonly [string, SayGmApiRoute]> = [
  ["responses", "responses"],
  ["messages", "messages"],
  ["streamGenerateContent", "gemini"],
  ["chat.completions", "chat"],
];

/**
 * The format to call a model with, or `null` when it has no chat format.
 * Without the catalog entry (it should always be stored) the id decides.
 */
export function getSayGmApiRoute(
  providerModelId: string,
  metadata: Record<string, unknown> | null | undefined,
): SayGmApiRoute | null {
  const shapes = metadata?.["api_shapes"];
  if (Array.isArray(shapes)) {
    return ROUTES_BY_SHAPE.find(([shape]) => shapes.includes(shape))?.[1] ?? null;
  }

  if (providerModelId.startsWith("claude-")) return "messages";
  if (providerModelId.startsWith("gemini-")) return "gemini";
  if (/^(gpt-(?!oss)|o\d)/.test(providerModelId)) return "responses";
  return "chat";
}

/**
 * What each route's AI SDK adapter accepts. GPT models on Responses take
 * none/low/medium/high/xhigh and reject "minimal". Chat models that publish
 * no levels all took low/medium/high in testing; "none" is left out since
 * some of them always think.
 */
const EFFORTS_BY_ROUTE = {
  responses: ["none", "low", "medium", "high", "xhigh"],
  messages: ["none", "low", "medium", "high"],
  gemini: ["none", "minimal", "low", "medium", "high"],
  chat: ["low", "medium", "high"],
} satisfies Record<SayGmApiRoute, readonly ReasoningEffort[]>;

/** SayGM names levels the OpenAI way, except "max" for the top one. */
const SAYGM_EFFORT_NAMES: Record<string, ReasoningEffort> = {
  none: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh",
};

const EFFORT_ORDER: readonly ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * Levels to offer for one model. A catalog entry's own `reasoning_efforts`
 * (e.g. GLM 5.3 Flash: low, high, max; it can't stop thinking) wins over the
 * route's defaults.
 */
export function getSayGmReasoningEfforts(
  metadata: Record<string, unknown> | null | undefined,
): ReasoningEffort[] {
  const providerModelId = typeof metadata?.["id"] === "string" ? metadata["id"] : "";
  const route = getSayGmApiRoute(providerModelId, metadata);
  if (!route) {
    return [];
  }

  const published = metadata?.["reasoning_efforts"];
  if (Array.isArray(published) && published.length > 0) {
    const efforts = new Set(
      published.map((name) => (typeof name === "string" ? SAYGM_EFFORT_NAMES[name] : undefined)),
    );
    return EFFORT_ORDER.filter((effort) => efforts.has(effort));
  }

  return [...EFFORTS_BY_ROUTE[route]];
}

/** `GET /v1/credits`; amounts are USD. `spent` is absent when SayGM doesn't know it. */
export interface SayGmCreditBalance {
  balance: number;
  spent: number | null;
}

export function parseSayGmCreditBalance(body: unknown): SayGmCreditBalance {
  const record = readRecord(body);
  const balance = readNanoUsd(record?.["balance"]);
  if (balance === null) {
    throw new Error("SayGM credit response does not contain a balance.");
  }

  return { balance, spent: readNanoUsd(record?.["spent"]) };
}

/**
 * The billed cost of one response in USD. SayGM adds it to every successful
 * response's usage: `cost_nano_usd` on OpenAI and Anthropic shapes,
 * `costNanoUsd` on Gemini's. Nano-dollars are exact integers; `cost` is the
 * same amount as a float.
 */
export function readSayGmBilledCost(rawUsage: unknown): number | null {
  const usage = readRecord(rawUsage);
  const nanoUsd = usage?.["cost_nano_usd"] ?? usage?.["costNanoUsd"];
  if (typeof nanoUsd === "number" && Number.isFinite(nanoUsd) && nanoUsd >= 0) {
    return nanoUsd / 1e9;
  }

  const cost = usage?.["cost"];
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function readNanoUsd(value: unknown): number | null {
  const nanoUsd = readRecord(value)?.["nano_usd"];
  return typeof nanoUsd === "number" && Number.isFinite(nanoUsd) ? nanoUsd / 1e9 : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
